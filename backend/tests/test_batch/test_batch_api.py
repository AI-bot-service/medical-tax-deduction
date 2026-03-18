"""Tests for Batch API Router (F-01).

Tests verify:
- POST /batch creates BatchJob, returns 201
- POST /batch validates file count limits
- GET /batch/{id} returns BatchJobDetail
- GET /batch/{id} returns 404 for unknown batch
"""
from __future__ import annotations

import io
import sys
import uuid
from types import ModuleType
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.base import Base
from app.models.enums import BatchSource, BatchStatus
from app.models.user import User

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

# ── Pre-mock heavy worker modules so they never touch Redis/Celery ────────────
# This must happen before any import of batch router touches workers.*

_mock_batch_task_module = ModuleType("workers.tasks.batch_task")
_mock_process_batch_file = MagicMock()
_mock_process_batch_file.delay = MagicMock(return_value=None)
_mock_batch_task_module.process_batch_file = _mock_process_batch_file

_mock_workers_tasks = ModuleType("workers.tasks")
_mock_workers_tasks.batch_task = _mock_batch_task_module

_mock_workers = ModuleType("workers")
_mock_workers.tasks = _mock_workers_tasks


@pytest.fixture(autouse=True, scope="module")
def mock_worker_modules():
    """Inject mock workers into sys.modules so celery/redis is never touched."""
    orig = {
        k: sys.modules.get(k)
        for k in ("workers", "workers.tasks", "workers.tasks.batch_task")
    }
    sys.modules["workers"] = _mock_workers
    sys.modules["workers.tasks"] = _mock_workers_tasks
    sys.modules["workers.tasks.batch_task"] = _mock_batch_task_module
    yield
    for k, v in orig.items():
        if v is None:
            sys.modules.pop(k, None)
        else:
            sys.modules[k] = v


@pytest.fixture
async def engine():
    eng = create_async_engine(TEST_DB_URL, echo=False)
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
    user = User(id=uuid.uuid4(), telegram_id=111222333, phone_hash="batch_hash")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
def app_client(engine, test_user):
    from app.routers.batch import router
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


_JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"


def _upload_files(n: int):
    return [
        ("files", (f"photo{i}.jpg", io.BytesIO(_JPEG), "image/jpeg"))
        for i in range(n)
    ]


# ---------------------------------------------------------------------------
# POST /api/v1/batch
# ---------------------------------------------------------------------------

class TestCreateBatch:
    def test_create_batch_returns_201(self, app_client):
        with patch("app.routers.batch.S3Client") as mock_s3_cls:
            mock_s3_cls.return_value.upload_file.return_value = None
            resp = app_client.post("/api/v1/batch", files=_upload_files(2))
        assert resp.status_code == 201

    def test_create_batch_returns_batch_id(self, app_client):
        with patch("app.routers.batch.S3Client") as mock_s3_cls:
            mock_s3_cls.return_value.upload_file.return_value = None
            resp = app_client.post("/api/v1/batch", files=_upload_files(1))
        data = resp.json()
        assert "batch_id" in data
        uuid.UUID(data["batch_id"])  # must be a valid UUID

    def test_create_batch_total_files_correct(self, app_client):
        with patch("app.routers.batch.S3Client") as mock_s3_cls:
            mock_s3_cls.return_value.upload_file.return_value = None
            resp = app_client.post("/api/v1/batch", files=_upload_files(3))
        assert resp.json()["total_files"] == 3

    def test_create_batch_status_is_processing(self, app_client):
        with patch("app.routers.batch.S3Client") as mock_s3_cls:
            mock_s3_cls.return_value.upload_file.return_value = None
            resp = app_client.post("/api/v1/batch", files=_upload_files(1))
        assert resp.json()["status"] == "processing"

    def test_create_batch_source_is_web(self, app_client):
        with patch("app.routers.batch.S3Client") as mock_s3_cls:
            mock_s3_cls.return_value.upload_file.return_value = None
            resp = app_client.post("/api/v1/batch", files=_upload_files(1))
        assert resp.json()["source"] == "web"

    def test_create_batch_no_files_returns_422(self, app_client):
        resp = app_client.post("/api/v1/batch", files=[])
        assert resp.status_code in (400, 422)

    def test_create_batch_too_many_files_returns_422(self, app_client):
        with patch("app.routers.batch.S3Client") as mock_s3_cls:
            mock_s3_cls.return_value.upload_file.return_value = None
            resp = app_client.post("/api/v1/batch", files=_upload_files(21))
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/v1/batch/{id}
# ---------------------------------------------------------------------------

class TestGetBatch:
    def _create_batch(self, app_client) -> str:
        with patch("app.routers.batch.S3Client") as mock_s3_cls:
            mock_s3_cls.return_value.upload_file.return_value = None
            resp = app_client.post("/api/v1/batch", files=_upload_files(2))
        assert resp.status_code == 201
        return resp.json()["batch_id"]

    def test_get_batch_returns_200(self, app_client):
        batch_id = self._create_batch(app_client)
        resp = app_client.get(f"/api/v1/batch/{batch_id}")
        assert resp.status_code == 200

    def test_get_batch_has_counts(self, app_client):
        batch_id = self._create_batch(app_client)
        data = app_client.get(f"/api/v1/batch/{batch_id}").json()
        assert "done_count" in data
        assert "review_count" in data
        assert "failed_count" in data

    def test_get_batch_unknown_id_returns_404(self, app_client):
        resp = app_client.get(f"/api/v1/batch/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_get_batch_total_files_matches(self, app_client):
        batch_id = self._create_batch(app_client)
        data = app_client.get(f"/api/v1/batch/{batch_id}").json()
        assert data["total_files"] == 2
