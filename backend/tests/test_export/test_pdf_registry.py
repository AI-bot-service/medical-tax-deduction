"""Tests for PDF Registry + ZIP Packager + Export API (H-01)."""
from __future__ import annotations

import io
import sys
import uuid
import zipfile
from datetime import date
from types import ModuleType
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.export.pdf_registry import RegistryRow, _build_pdf

# Pre-mock export_task to avoid Celery/Redis import in tests
_mock_export_task_module = ModuleType("workers.tasks.export_task")
_mock_generate_export = MagicMock()
_mock_generate_export.delay = MagicMock(return_value=None)
_mock_export_task_module.generate_export = _mock_generate_export

sys.modules.setdefault("workers.tasks.export_task", _mock_export_task_module)


# ---------------------------------------------------------------------------
# Unit tests for _build_pdf (no DB needed)
# ---------------------------------------------------------------------------

class TestBuildPdf:
    def test_empty_rows_returns_bytes(self):
        """Empty registry → PDF bytes, not empty."""
        pdf = _build_pdf([], 2024, "user-uuid-1234")
        assert isinstance(pdf, bytes)
        assert len(pdf) > 0

    def test_pdf_starts_with_pdf_magic(self):
        """%PDF magic bytes present."""
        pdf = _build_pdf([], 2024, "user-uuid-1234")
        assert pdf[:4] == b"%PDF"

    def test_single_row_generates_pdf(self):
        row = RegistryRow(
            receipt_id=uuid.uuid4(),
            purchase_date=date(2024, 3, 15),
            pharmacy_name="Аптека 36.6",
            drug_name="Ибупрофен 400мг",
            drug_inn="ибупрофен",
            quantity=1.0,
            total_price=250.50,
            prescription_id=uuid.uuid4(),
        )
        pdf = _build_pdf([row], 2024, "user-uuid-1234")
        assert len(pdf) > 500  # meaningful PDF

    def test_row_without_prescription_generates_pdf(self):
        """Rows without prescription_id should still generate a valid PDF."""
        row = RegistryRow(
            receipt_id=uuid.uuid4(),
            purchase_date=date(2024, 3, 15),
            pharmacy_name="Аптека",
            drug_name="Парацетамол",
            drug_inn="парацетамол",
            quantity=2.0,
            total_price=120.0,
            prescription_id=None,  # missing prescription
        )
        pdf = _build_pdf([row], 2024, "user-uuid-1234")
        assert pdf[:4] == b"%PDF"

    def test_multiple_months_generates_pdf(self):
        """Rows in different months produce monthly subtotals."""
        rows = [
            RegistryRow(
                receipt_id=uuid.uuid4(),
                purchase_date=date(2024, m, 15),
                pharmacy_name="Аптека",
                drug_name=f"Drug {m}",
                drug_inn=f"inn{m}",
                quantity=1.0,
                total_price=100.0 * m,
                prescription_id=uuid.uuid4(),
            )
            for m in [1, 2, 3]
        ]
        pdf = _build_pdf(rows, 2024, "user-uuid-1234")
        assert pdf[:4] == b"%PDF"


# ---------------------------------------------------------------------------
# ZIP Packager tests (mocked S3 + DB)
# ---------------------------------------------------------------------------

class TestZipPackager:
    @pytest.mark.anyio
    async def test_build_zip_returns_valid_zip(self):
        """build_zip returns a valid ZIP archive."""
        from app.services.export.zip_packager import build_zip

        # Set up mock DB: execute() returns a MagicMock with .scalars().all() = []
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result

        with (
            patch("app.services.export.pdf_registry.generate_registry", return_value=b"%PDF-mock"),
            patch("app.services.storage.s3_client.S3Client"),
        ):
            zip_bytes = await build_zip(uuid.uuid4(), 2024, mock_db)

        assert isinstance(zip_bytes, bytes)
        assert len(zip_bytes) > 0
        # Verify it's a valid ZIP
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            names = zf.namelist()
        assert any("rejestr_2024.pdf" in n for n in names)

    @pytest.mark.anyio
    async def test_upload_zip_calls_s3(self):
        """upload_zip puts the file in S3 and returns the s3_key."""
        from app.services.export.zip_packager import upload_zip

        mock_s3 = MagicMock()
        mock_s3.upload_file.return_value = None

        with patch("app.services.storage.s3_client.S3Client", return_value=mock_s3):
            s3_key = await upload_zip(uuid.uuid4(), 2024, b"fake-zip")

        assert mock_s3.upload_file.called
        assert "2024" in s3_key
        assert s3_key.endswith(".zip")


# ---------------------------------------------------------------------------
# Export API tests
# ---------------------------------------------------------------------------

class TestExportAPI:
    @pytest.fixture
    def engine_and_client(self):
        import uuid as _uuid
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

        from app.models.base import Base
        from app.models.user import User
        from app.routers.export import router
        from app.dependencies import get_db, get_current_user

        import asyncio

        TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

        async def setup():
            eng = create_async_engine(TEST_DB_URL)
            async with eng.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            return eng

        engine = asyncio.get_event_loop().run_until_complete(setup())
        factory = async_sessionmaker(engine, expire_on_commit=False)

        user = User(id=_uuid.uuid4(), telegram_id=555666777, phone_hash="export_hash")

        async def add_user():
            async with factory() as s:
                s.add(user)
                await s.commit()
                await s.refresh(user)

        asyncio.get_event_loop().run_until_complete(add_user())

        app = FastAPI()
        app.include_router(router, prefix="/api/v1")

        async def override_db():
            async with factory() as s:
                yield s

        async def override_user():
            return user

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = override_user

        yield TestClient(app, raise_server_exceptions=True), user

        asyncio.get_event_loop().run_until_complete(engine.dispose())

    def test_post_export_returns_201(self, engine_and_client):
        client, _ = engine_and_client
        resp = client.post("/api/v1/export?year=2024")
        assert resp.status_code == 201

    def test_post_export_returns_export_id(self, engine_and_client):
        client, _ = engine_and_client
        resp = client.post("/api/v1/export?year=2024")
        assert resp.status_code == 201
        data = resp.json()
        assert "export_id" in data
        uuid.UUID(data["export_id"])

    def test_get_export_returns_200(self, engine_and_client):
        client, _ = engine_and_client
        # Create first
        resp = client.post("/api/v1/export?year=2024")
        export_id = resp.json()["export_id"]
        resp2 = client.get(f"/api/v1/export/{export_id}")
        assert resp2.status_code == 200

    def test_get_export_unknown_returns_404(self, engine_and_client):
        client, _ = engine_and_client
        resp = client.get(f"/api/v1/export/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_get_export_has_status(self, engine_and_client):
        client, _ = engine_and_client
        resp = client.post("/api/v1/export?year=2024")
        export_id = resp.json()["export_id"]
        data = client.get(f"/api/v1/export/{export_id}").json()
        assert "status" in data
        assert data["status"] == "pending"
