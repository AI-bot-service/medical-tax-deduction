"""Tests for SSE Stream endpoint (F-02).

GET /api/v1/batch/{batch_id}/stream — FastAPI StreamingResponse, Redis PubSub.
"""
from __future__ import annotations

import io
import json
import sys
import uuid
from types import ModuleType
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Pre-mock worker modules to avoid Celery/Redis import timeouts
_mock_batch_task_module = ModuleType("workers.tasks.batch_task")
_mock_batch_task_module.process_batch_file = MagicMock()
sys.modules.setdefault("workers.tasks.batch_task", _mock_batch_task_module)

from app.dependencies import get_current_user, get_db  # noqa: E402
from app.models.base import Base  # noqa: E402
from app.models.user import User  # noqa: E402
from app.routers.batch import router  # noqa: E402

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

# Minimal valid JPEG bytes for file uploads
_JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"


# ---------------------------------------------------------------------------
# Mock Redis pubsub helper
# ---------------------------------------------------------------------------


def _make_mock_redis(messages: list[dict]):
    """Return (async_get_redis, mock_pubsub)."""

    async def fake_listen():
        yield {"type": "subscribe", "channel": b"batch:test", "data": 1}
        for msg in messages:
            yield {"type": "message", "channel": b"batch:test", "data": json.dumps(msg)}

    mock_pubsub = MagicMock()
    mock_pubsub.subscribe = AsyncMock()
    mock_pubsub.unsubscribe = AsyncMock()
    mock_pubsub.aclose = AsyncMock()
    mock_pubsub.listen = fake_listen

    mock_redis = MagicMock()
    mock_redis.pubsub.return_value = mock_pubsub

    # get_redis is `await get_redis()` in router
    async_get_redis = AsyncMock(return_value=mock_redis)
    return async_get_redis, mock_pubsub


# ---------------------------------------------------------------------------
# Fixtures — async, same pattern as test_batch_api.py
# ---------------------------------------------------------------------------


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
    user = User(id=uuid.uuid4(), telegram_id=123456789, phone_hash="sse_test")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
def app_client(engine, test_user):
    """Synchronous TestClient — same engine used by async fixtures."""
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_db():
        async with factory() as s:
            yield s

    async def override_user():
        return test_user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user

    return TestClient(app, raise_server_exceptions=True)


def _create_batch(client) -> str:
    """Helper: POST /batch and return batch_id."""
    with patch("app.routers.batch.S3Client") as mock_s3_cls:
        mock_s3_cls.return_value.upload_file.return_value = None
        resp = client.post(
            "/api/v1/batch",
            files=[("files", ("photo.jpg", io.BytesIO(_JPEG), "image/jpeg"))],
        )
    assert resp.status_code == 201
    return resp.json()["batch_id"]


# ---------------------------------------------------------------------------
# Tests: ownership / 404
# ---------------------------------------------------------------------------


class TestSSEOwnership:
    def test_unknown_batch_returns_404(self, app_client):
        """Non-existent batch_id → 404."""
        async_get_redis, _ = _make_mock_redis([{"completed": True}])
        with patch("app.routers.batch.get_redis", async_get_redis):
            resp = app_client.get(f"/api/v1/batch/{uuid.uuid4()}/stream")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Tests: SSE streaming
# ---------------------------------------------------------------------------


class TestSSEStream:
    def test_stream_content_type(self, app_client):
        """Response content-type is text/event-stream."""
        batch_id = _create_batch(app_client)
        async_get_redis, _ = _make_mock_redis([{"completed": True}])
        with patch("app.routers.batch.get_redis", async_get_redis):
            resp = app_client.get(f"/api/v1/batch/{batch_id}/stream")
        assert "text/event-stream" in resp.headers.get("content-type", "")

    def test_stream_delivers_event_data(self, app_client):
        """Events from Redis PubSub appear as 'data: ...' lines."""
        batch_id = _create_batch(app_client)
        payload = {"file_index": 0, "status": "done", "completed": False}
        async_get_redis, _ = _make_mock_redis([payload, {"completed": True}])
        with patch("app.routers.batch.get_redis", async_get_redis):
            resp = app_client.get(f"/api/v1/batch/{batch_id}/stream")
        assert "data:" in resp.text
        assert "file_index" in resp.text

    def test_stream_closes_on_batch_complete(self, app_client):
        """Stream closes after completed=true; exactly 2 data: lines."""
        batch_id = _create_batch(app_client)
        messages = [
            {"file_index": 0, "status": "done", "completed": False},
            {"file_index": 1, "status": "done", "completed": True},
        ]
        async_get_redis, _ = _make_mock_redis(messages)
        with patch("app.routers.batch.get_redis", async_get_redis):
            resp = app_client.get(f"/api/v1/batch/{batch_id}/stream")
        assert resp.text.count("data:") == 2

    def test_stream_cache_control_header(self, app_client):
        """Cache-Control: no-cache must be present."""
        batch_id = _create_batch(app_client)
        async_get_redis, _ = _make_mock_redis([{"completed": True}])
        with patch("app.routers.batch.get_redis", async_get_redis):
            resp = app_client.get(f"/api/v1/batch/{batch_id}/stream")
        assert resp.headers.get("cache-control") == "no-cache"

    def test_stream_subscribe_correct_channel(self, app_client):
        """Redis PubSub subscribe called with correct channel name."""
        batch_id = _create_batch(app_client)
        async_get_redis, mock_pubsub = _make_mock_redis([{"completed": True}])
        with patch("app.routers.batch.get_redis", async_get_redis):
            app_client.get(f"/api/v1/batch/{batch_id}/stream")
        mock_pubsub.subscribe.assert_called_once_with(f"batch:{batch_id}")

    def test_stream_single_completed_event(self, app_client):
        """Single completed event immediately closes the stream."""
        batch_id = _create_batch(app_client)
        async_get_redis, _ = _make_mock_redis([{"completed": True}])
        with patch("app.routers.batch.get_redis", async_get_redis):
            resp = app_client.get(f"/api/v1/batch/{batch_id}/stream")
        assert resp.status_code == 200
        assert "data:" in resp.text
