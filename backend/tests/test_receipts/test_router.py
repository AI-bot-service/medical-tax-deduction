"""Tests for Receipts Router (E-01).

Uses SQLite in-memory DB and mocked S3 + Celery.
"""
from __future__ import annotations

import io
import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.base import Base
from app.models.enums import OCRStatus
from app.models.receipt import Receipt
from app.models.receipt_item import ReceiptItem
from app.models.user import User

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


# ---------------------------------------------------------------------------
# DB + app fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def engine():
    eng = create_async_engine(TEST_DB_URL)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest.fixture
async def db(engine):
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest.fixture
async def test_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        telegram_id=123456789,
        phone_hash="abc123",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
def app_client(engine, test_user):
    """FastAPI TestClient with overridden DB and auth dependencies."""
    from fastapi import FastAPI

    from app.routers.receipts import router
    from app.dependencies import get_db, get_current_user

    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_db():
        async with factory() as session:
            yield session

    async def override_user():
        return test_user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user

    return TestClient(app, raise_server_exceptions=True)


# ---------------------------------------------------------------------------
# POST /receipts/upload
# ---------------------------------------------------------------------------


class TestUploadReceipt:
    def _jpeg_file(self, name: str = "test.jpg") -> tuple:
        return ("file", (name, io.BytesIO(b"\xff\xd8\xff" + b"0" * 100), "image/jpeg"))

    def test_upload_jpeg_returns_201(self, app_client, engine):
        """Valid JPEG upload → 201 with receipt_id."""
        with (
            patch("app.routers.receipts.S3Client") as MockS3,
            patch("app.routers.receipts.process_receipt", create=True),
        ):
            mock_s3 = MagicMock()
            MockS3.return_value = mock_s3

            resp = app_client.post(
                "/api/v1/receipts/upload",
                files=[self._jpeg_file()],
            )

        assert resp.status_code == 201
        data = resp.json()
        assert "receipt_id" in data
        assert data["status"] == "PENDING"

    def test_upload_creates_db_record(self, app_client, engine):
        """After upload, a Receipt row exists in DB with status PENDING."""
        with (
            patch("app.routers.receipts.S3Client") as MockS3,
            patch("app.routers.receipts.process_receipt", create=True),
        ):
            mock_s3 = MagicMock()
            MockS3.return_value = mock_s3

            resp = app_client.post(
                "/api/v1/receipts/upload",
                files=[self._jpeg_file()],
            )

        assert resp.status_code == 201
        receipt_id = uuid.UUID(resp.json()["receipt_id"])

        # Verify DB record via sync check (run_sync not needed — we use anyio)
        import asyncio

        factory = async_sessionmaker(engine, expire_on_commit=False)

        async def check():
            async with factory() as session:
                result = await session.execute(
                    select(Receipt).where(Receipt.id == receipt_id)
                )
                return result.scalar_one_or_none()

        receipt = asyncio.get_event_loop().run_until_complete(check())
        assert receipt is not None
        assert receipt.ocr_status == OCRStatus.PENDING

    def test_upload_invalid_extension_422(self, app_client):
        """Uploading .exe → 422."""
        with patch("app.routers.receipts.S3Client"):
            resp = app_client.post(
                "/api/v1/receipts/upload",
                files=[("file", ("malware.exe", io.BytesIO(b"MZ"), "application/octet-stream"))],
            )
        assert resp.status_code == 422

    def test_upload_s3_error_502(self, app_client):
        """S3 failure → 502."""
        with (
            patch("app.routers.receipts.S3Client") as MockS3,
        ):
            mock_s3 = MagicMock()
            mock_s3.upload_file.side_effect = RuntimeError("S3 down")
            MockS3.return_value = mock_s3

            resp = app_client.post(
                "/api/v1/receipts/upload",
                files=[self._jpeg_file()],
            )
        assert resp.status_code == 502

    def test_upload_pdf_accepted(self, app_client):
        """PDF file is accepted."""
        with (
            patch("app.routers.receipts.S3Client") as MockS3,
            patch("app.routers.receipts.process_receipt", create=True),
        ):
            mock_s3 = MagicMock()
            MockS3.return_value = mock_s3

            resp = app_client.post(
                "/api/v1/receipts/upload",
                files=[("file", ("receipt.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf"))],
            )
        assert resp.status_code == 201


# ---------------------------------------------------------------------------
# GET /receipts
# ---------------------------------------------------------------------------


class TestListReceipts:
    @pytest.fixture
    async def receipts(self, db: AsyncSession, test_user: User):
        """Create 3 receipts for test_user."""
        from datetime import datetime, timezone

        r1 = Receipt(
            id=uuid.uuid4(),
            user_id=test_user.id,
            s3_key="receipts/test/r1.jpg",
            ocr_status=OCRStatus.DONE,
            total_amount=1000.0,
            purchase_date=date(2024, 1, 10),
        )
        r2 = Receipt(
            id=uuid.uuid4(),
            user_id=test_user.id,
            s3_key="receipts/test/r2.jpg",
            ocr_status=OCRStatus.DONE,
            total_amount=2500.0,
            purchase_date=date(2024, 1, 20),
        )
        r3 = Receipt(
            id=uuid.uuid4(),
            user_id=test_user.id,
            s3_key="receipts/test/r3.jpg",
            ocr_status=OCRStatus.REVIEW,
            total_amount=500.0,
            purchase_date=date(2024, 2, 5),
        )
        db.add_all([r1, r2, r3])
        await db.commit()
        return [r1, r2, r3]

    def test_list_returns_all_receipts(self, app_client, receipts):
        resp = app_client.get("/api/v1/receipts")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_count"] == 3

    def test_list_grouped_by_month(self, app_client, receipts):
        resp = app_client.get("/api/v1/receipts")
        data = resp.json()
        months = {m["month"]: m for m in data["months"]}
        # Should have at least one month group
        assert len(data["months"]) >= 1

    def test_list_empty_for_new_user(self, app_client):
        resp = app_client.get("/api/v1/receipts")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_count"] == 0
        assert data["months"] == []


# ---------------------------------------------------------------------------
# GET /receipts/{id}
# ---------------------------------------------------------------------------


class TestGetReceiptDetail:
    @pytest.fixture
    async def receipt_with_items(self, db: AsyncSession, test_user: User):
        receipt = Receipt(
            id=uuid.uuid4(),
            user_id=test_user.id,
            s3_key="receipts/test/detail.jpg",
            ocr_status=OCRStatus.DONE,
            total_amount=350.0,
            pharmacy_name="Аптека Ромашка",
            purchase_date=date(2024, 3, 15),
            ocr_confidence=0.91,
            merge_strategy="merged",
        )
        db.add(receipt)
        await db.flush()

        item = ReceiptItem(
            id=uuid.uuid4(),
            receipt_id=receipt.id,
            drug_name="Аспирин",
            drug_inn="ацетилсалициловая кислота",
            quantity=2.0,
            unit_price=100.0,
            total_price=200.0,
            is_rx=False,
        )
        db.add(item)
        await db.commit()
        await db.refresh(receipt)
        return receipt

    def test_get_detail_returns_receipt(self, app_client, receipt_with_items):
        with patch("app.routers.receipts.S3Client") as MockS3:
            mock_s3 = MagicMock()
            mock_s3.generate_presigned_url.return_value = "https://s3.example.com/presigned"
            MockS3.return_value = mock_s3

            resp = app_client.get(f"/api/v1/receipts/{receipt_with_items.id}")

        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(receipt_with_items.id)
        assert data["pharmacy_name"] == "Аптека Ромашка"
        assert data["image_url"] == "https://s3.example.com/presigned"

    def test_get_detail_includes_items(self, app_client, receipt_with_items):
        with patch("app.routers.receipts.S3Client") as MockS3:
            MockS3.return_value = MagicMock()
            resp = app_client.get(f"/api/v1/receipts/{receipt_with_items.id}")

        data = resp.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["drug_name"] == "Аспирин"

    def test_get_detail_404_for_wrong_user(self, app_client):
        """Non-existent receipt → 404."""
        with patch("app.routers.receipts.S3Client"):
            resp = app_client.get(f"/api/v1/receipts/{uuid.uuid4()}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /receipts/{id}
# ---------------------------------------------------------------------------


class TestPatchReceipt:
    @pytest.fixture
    async def patchable_receipt(self, db: AsyncSession, test_user: User):
        receipt = Receipt(
            id=uuid.uuid4(),
            user_id=test_user.id,
            s3_key="receipts/test/patch.jpg",
            ocr_status=OCRStatus.REVIEW,
            purchase_date=date(2024, 1, 1),
            pharmacy_name="Старое название",
            total_amount=100.0,
        )
        db.add(receipt)
        await db.commit()
        await db.refresh(receipt)
        return receipt

    def test_patch_purchase_date(self, app_client, patchable_receipt):
        resp = app_client.patch(
            f"/api/v1/receipts/{patchable_receipt.id}",
            json={"purchase_date": "2024-03-20"},
        )
        assert resp.status_code == 200
        assert resp.json()["purchase_date"] == "2024-03-20"

    def test_patch_pharmacy_name(self, app_client, patchable_receipt):
        resp = app_client.patch(
            f"/api/v1/receipts/{patchable_receipt.id}",
            json={"pharmacy_name": "Новая аптека"},
        )
        assert resp.status_code == 200
        assert resp.json()["pharmacy_name"] == "Новая аптека"

    def test_patch_total_amount(self, app_client, patchable_receipt):
        resp = app_client.patch(
            f"/api/v1/receipts/{patchable_receipt.id}",
            json={"total_amount": "250.50"},
        )
        assert resp.status_code == 200
        assert float(resp.json()["total_amount"]) == pytest.approx(250.50)

    def test_patch_nonexistent_returns_404(self, app_client):
        resp = app_client.patch(
            f"/api/v1/receipts/{uuid.uuid4()}",
            json={"pharmacy_name": "Ghost"},
        )
        assert resp.status_code == 404
