"""Tests for Celery OCR Task (B-08).

Uses mock S3, mock pipeline and SQLite in-memory DB.
"""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.base import Base
from app.models.enums import OCRStatus
from app.models.receipt import Receipt
from app.models.receipt_item import ReceiptItem

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


# ---------------------------------------------------------------------------
# DB fixtures
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
async def pending_receipt(db: AsyncSession):
    """A Receipt record with PENDING status in the test DB."""
    user_id = uuid.uuid4()
    receipt = Receipt(
        id=uuid.uuid4(),
        user_id=user_id,
        s3_key=f"receipts/{user_id}/test.jpg",
        ocr_status=OCRStatus.PENDING,
    )
    db.add(receipt)
    await db.commit()
    await db.refresh(receipt)
    return receipt


# ---------------------------------------------------------------------------
# Helpers — build ParsedReceipt mock
# ---------------------------------------------------------------------------

from app.services.ocr.pipeline import NormalizedItem, ParsedReceipt


def _make_parsed(confidence: float = 0.90, has_rx: bool = False) -> ParsedReceipt:
    items = []
    if has_rx:
        items.append(
            NormalizedItem(
                drug_name_raw="Амоксициллин",
                drug_inn="амоксициллин",
                is_rx=True,
                quantity=1.0,
                unit_price=Decimal("150.00"),
                total_price=Decimal("150.00"),
                drug_match_score=0.95,
            )
        )
    items.append(
        NormalizedItem(
            drug_name_raw="Аспирин",
            drug_inn="ацетилсалициловая кислота",
            is_rx=False,
            quantity=2.0,
            unit_price=Decimal("50.00"),
            total_price=Decimal("100.00"),
            drug_match_score=0.92,
        )
    )
    return ParsedReceipt(
        strategy="merged",
        confidence=confidence,
        purchase_date=date(2024, 3, 15),
        total_amount=Decimal("250.00"),
        pharmacy_name="Аптека Здоровье",
        raw_text="фискальный чек ...",
        items=items,
        processing_time_ms=1200,
    )


# ---------------------------------------------------------------------------
# Tests for _ocr_status_from_confidence
# ---------------------------------------------------------------------------


class TestOCRStatusMapping:
    def test_high_confidence_is_done(self):
        from workers.tasks.ocr_task import _ocr_status_from_confidence

        assert _ocr_status_from_confidence(0.95) == OCRStatus.DONE
        assert _ocr_status_from_confidence(0.85) == OCRStatus.DONE

    def test_medium_confidence_is_review(self):
        from workers.tasks.ocr_task import _ocr_status_from_confidence

        assert _ocr_status_from_confidence(0.84) == OCRStatus.REVIEW
        assert _ocr_status_from_confidence(0.60) == OCRStatus.REVIEW

    def test_low_confidence_is_failed(self):
        from workers.tasks.ocr_task import _ocr_status_from_confidence

        assert _ocr_status_from_confidence(0.59) == OCRStatus.FAILED
        assert _ocr_status_from_confidence(0.0) == OCRStatus.FAILED


# ---------------------------------------------------------------------------
# Integration: _run() with mock S3 + mock pipeline
# ---------------------------------------------------------------------------


class TestRunTask:
    @pytest.mark.anyio
    async def test_receipt_status_updated_to_done(self, pending_receipt, engine):
        """High-confidence result → receipt status = DONE."""
        parsed = _make_parsed(confidence=0.92)
        factory = async_sessionmaker(engine, expire_on_commit=False)

        with (
            patch("workers.tasks.ocr_task._WorkerSession", factory),
            patch("workers.tasks.ocr_task.S3Client") as MockS3,
            patch("workers.tasks.ocr_task.process_image", new=AsyncMock(return_value=parsed)),
        ):
            mock_s3 = MagicMock()
            mock_s3.get_object.return_value = {"Body": MagicMock(read=lambda: b"fake-image")}
            MockS3.return_value = mock_s3

            from workers.tasks.ocr_task import _run

            await _run(str(pending_receipt.id))

        async with factory() as verify_db:
            result = await verify_db.execute(
                select(Receipt).where(Receipt.id == pending_receipt.id)
            )
            updated = result.scalar_one()

        assert updated.ocr_status == OCRStatus.DONE
        assert updated.pharmacy_name == "Аптека Здоровье"
        assert float(updated.total_amount) == 250.0
        assert updated.ocr_confidence == pytest.approx(0.92)
        assert updated.merge_strategy == "merged"
        assert updated.purchase_date == date(2024, 3, 15)

    @pytest.mark.anyio
    async def test_receipt_items_created(self, pending_receipt, engine):
        """ParsedReceipt items → ReceiptItem rows in DB."""
        parsed = _make_parsed(confidence=0.90, has_rx=False)
        factory = async_sessionmaker(engine, expire_on_commit=False)

        with (
            patch("workers.tasks.ocr_task._WorkerSession", factory),
            patch("workers.tasks.ocr_task.S3Client") as MockS3,
            patch("workers.tasks.ocr_task.process_image", new=AsyncMock(return_value=parsed)),
        ):
            mock_s3 = MagicMock()
            mock_s3.get_object.return_value = {"Body": MagicMock(read=lambda: b"fake-image")}
            MockS3.return_value = mock_s3

            from workers.tasks.ocr_task import _run

            await _run(str(pending_receipt.id))

        async with factory() as verify_db:
            items_result = await verify_db.execute(
                select(ReceiptItem).where(ReceiptItem.receipt_id == pending_receipt.id)
            )
            items = items_result.scalars().all()

        assert len(items) == 1  # only non-rx in this parsed
        assert items[0].drug_name == "Аспирин"
        assert items[0].is_rx is False

    @pytest.mark.anyio
    async def test_rx_item_sets_needs_prescription(self, pending_receipt, engine):
        """is_rx=True item → receipt.needs_prescription = True."""
        parsed = _make_parsed(confidence=0.88, has_rx=True)
        factory = async_sessionmaker(engine, expire_on_commit=False)

        with (
            patch("workers.tasks.ocr_task._WorkerSession", factory),
            patch("workers.tasks.ocr_task.S3Client") as MockS3,
            patch("workers.tasks.ocr_task.process_image", new=AsyncMock(return_value=parsed)),
            patch("workers.tasks.ocr_task._try_link_prescriptions", new=AsyncMock()),
        ):
            mock_s3 = MagicMock()
            mock_s3.get_object.return_value = {"Body": MagicMock(read=lambda: b"fake-image")}
            MockS3.return_value = mock_s3

            from workers.tasks.ocr_task import _run

            await _run(str(pending_receipt.id))

        async with factory() as verify_db:
            result = await verify_db.execute(
                select(Receipt).where(Receipt.id == pending_receipt.id)
            )
            updated = result.scalar_one()

        assert updated.needs_prescription is True

    @pytest.mark.anyio
    async def test_medium_confidence_review(self, pending_receipt, engine):
        """0.60-0.84 confidence → REVIEW status."""
        parsed = _make_parsed(confidence=0.72)
        factory = async_sessionmaker(engine, expire_on_commit=False)

        with (
            patch("workers.tasks.ocr_task._WorkerSession", factory),
            patch("workers.tasks.ocr_task.S3Client") as MockS3,
            patch("workers.tasks.ocr_task.process_image", new=AsyncMock(return_value=parsed)),
        ):
            mock_s3 = MagicMock()
            mock_s3.get_object.return_value = {"Body": MagicMock(read=lambda: b"fake-image")}
            MockS3.return_value = mock_s3

            from workers.tasks.ocr_task import _run

            await _run(str(pending_receipt.id))

        async with factory() as verify_db:
            result = await verify_db.execute(
                select(Receipt).where(Receipt.id == pending_receipt.id)
            )
            updated = result.scalar_one()

        assert updated.ocr_status == OCRStatus.REVIEW

    @pytest.mark.anyio
    async def test_low_confidence_failed(self, pending_receipt, engine):
        """< 0.60 confidence → FAILED status."""
        parsed = _make_parsed(confidence=0.45)
        factory = async_sessionmaker(engine, expire_on_commit=False)

        with (
            patch("workers.tasks.ocr_task._WorkerSession", factory),
            patch("workers.tasks.ocr_task.S3Client") as MockS3,
            patch("workers.tasks.ocr_task.process_image", new=AsyncMock(return_value=parsed)),
        ):
            mock_s3 = MagicMock()
            mock_s3.get_object.return_value = {"Body": MagicMock(read=lambda: b"fake-image")}
            MockS3.return_value = mock_s3

            from workers.tasks.ocr_task import _run

            await _run(str(pending_receipt.id))

        async with factory() as verify_db:
            result = await verify_db.execute(
                select(Receipt).where(Receipt.id == pending_receipt.id)
            )
            updated = result.scalar_one()

        assert updated.ocr_status == OCRStatus.FAILED

    @pytest.mark.anyio
    async def test_s3_failure_sets_failed(self, pending_receipt, engine):
        """S3 download error → receipt status = FAILED."""
        factory = async_sessionmaker(engine, expire_on_commit=False)

        with (
            patch("workers.tasks.ocr_task._WorkerSession", factory),
            patch("workers.tasks.ocr_task.S3Client") as MockS3,
        ):
            mock_s3 = MagicMock()
            mock_s3.get_object.side_effect = RuntimeError("S3 unavailable")
            MockS3.return_value = mock_s3

            from workers.tasks.ocr_task import _run

            await _run(str(pending_receipt.id))

        async with factory() as verify_db:
            result = await verify_db.execute(
                select(Receipt).where(Receipt.id == pending_receipt.id)
            )
            updated = result.scalar_one()

        assert updated.ocr_status == OCRStatus.FAILED

    @pytest.mark.anyio
    async def test_receipt_not_found_is_noop(self, engine):
        """Non-existent receipt_id → no exception, no DB changes."""
        factory = async_sessionmaker(engine, expire_on_commit=False)
        fake_id = str(uuid.uuid4())

        with (
            patch("workers.tasks.ocr_task._WorkerSession", factory),
            patch("workers.tasks.ocr_task.S3Client"),
        ):
            from workers.tasks.ocr_task import _run

            # Should complete without raising
            await _run(fake_id)
