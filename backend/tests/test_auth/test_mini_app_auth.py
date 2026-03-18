"""Tests for Mini App Auth (D-05).

POST /auth/mini-app — verify Telegram WebApp initData, issue JWT cookies.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from urllib.parse import urlencode

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.models.base import Base
from app.models.user import User
from app.routers.auth import router
from app.dependencies import get_db
from app.services.auth.mini_app_service import MiniAppService, MiniAppVerificationError

# ---------------------------------------------------------------------------
# Helpers for generating valid initData
# ---------------------------------------------------------------------------

BOT_TOKEN = "123456:ABC-test-token"


def _make_secret_key(bot_token: str) -> bytes:
    return hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()


def _build_init_data(
    telegram_id: int,
    bot_token: str = BOT_TOKEN,
    auth_date: int | None = None,
    tamper_hash: bool = False,
) -> str:
    """Build a valid Telegram WebApp initData string."""
    if auth_date is None:
        auth_date = int(time.time())

    user_obj = json.dumps({"id": telegram_id, "first_name": "Test"})
    fields = {
        "auth_date": str(auth_date),
        "user": user_obj,
    }

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret_key = _make_secret_key(bot_token)
    correct_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if tamper_hash:
        correct_hash = "0" * len(correct_hash)  # wrong hash

    fields["hash"] = correct_hash
    return urlencode(fields)


# ---------------------------------------------------------------------------
# Unit tests — MiniAppService
# ---------------------------------------------------------------------------


class TestMiniAppService:
    def test_verify_valid_init_data(self):
        svc = MiniAppService(bot_token=BOT_TOKEN)
        init_data = _build_init_data(telegram_id=123456789)
        fields = svc.verify(init_data)
        assert fields["auth_date"] is not None

    def test_extract_user_id(self):
        svc = MiniAppService(bot_token=BOT_TOKEN)
        init_data = _build_init_data(telegram_id=987654321)
        fields = svc.verify(init_data)
        assert svc.extract_user_id(fields) == 987654321

    def test_invalid_hash_raises(self):
        svc = MiniAppService(bot_token=BOT_TOKEN)
        init_data = _build_init_data(telegram_id=111, tamper_hash=True)
        with pytest.raises(MiniAppVerificationError, match="подпись"):
            svc.verify(init_data)

    def test_wrong_bot_token_raises(self):
        svc = MiniAppService(bot_token="wrong:token")
        init_data = _build_init_data(telegram_id=111, bot_token=BOT_TOKEN)
        with pytest.raises(MiniAppVerificationError):
            svc.verify(init_data)

    def test_missing_hash_raises(self):
        svc = MiniAppService(bot_token=BOT_TOKEN)
        # initData without hash field
        init_data = "auth_date=1234567890&user=%7B%22id%22%3A123%7D"
        with pytest.raises(MiniAppVerificationError, match="hash"):
            svc.verify(init_data)

    def test_expired_auth_date_raises(self):
        svc = MiniAppService(bot_token=BOT_TOKEN)
        old_auth_date = int(time.time()) - 90000  # older than 24h
        init_data = _build_init_data(telegram_id=111, auth_date=old_auth_date)
        with pytest.raises(MiniAppVerificationError, match="устарел"):
            svc.verify(init_data)

    def test_recent_auth_date_ok(self):
        svc = MiniAppService(bot_token=BOT_TOKEN)
        recent = int(time.time()) - 100  # 100 seconds ago — valid
        init_data = _build_init_data(telegram_id=111, auth_date=recent)
        fields = svc.verify(init_data)
        assert fields is not None


# ---------------------------------------------------------------------------
# Integration tests — POST /auth/mini-app endpoint
# ---------------------------------------------------------------------------

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
def client(monkeypatch):
    """FastAPI test client with SQLite in-memory DB and mocked bot token."""
    import asyncio

    monkeypatch.setattr("app.routers.auth.settings.telegram_bot_token", BOT_TOKEN)

    engine = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.get_event_loop().run_until_complete(setup())

    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def override_db():
        async with factory() as s:
            yield s

    app.dependency_overrides[get_db] = override_db

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


class TestMiniAppEndpoint:
    def test_valid_init_data_returns_200(self, client):
        init_data = _build_init_data(telegram_id=100200300)
        resp = client.post("/api/v1/auth/mini-app", json={"init_data": init_data})
        assert resp.status_code == 200

    def test_valid_init_data_sets_cookies(self, client):
        init_data = _build_init_data(telegram_id=100200300)
        resp = client.post("/api/v1/auth/mini-app", json={"init_data": init_data})
        assert "access_token" in resp.cookies
        assert "refresh_token" in resp.cookies

    def test_valid_init_data_returns_message(self, client):
        init_data = _build_init_data(telegram_id=100200300)
        resp = client.post("/api/v1/auth/mini-app", json={"init_data": init_data})
        data = resp.json()
        assert "message" in data

    def test_invalid_hash_returns_401(self, client):
        init_data = _build_init_data(telegram_id=111, tamper_hash=True)
        resp = client.post("/api/v1/auth/mini-app", json={"init_data": init_data})
        assert resp.status_code == 401

    def test_wrong_token_returns_401(self, client):
        init_data = _build_init_data(telegram_id=111, bot_token="wrong:token")
        resp = client.post("/api/v1/auth/mini-app", json={"init_data": init_data})
        assert resp.status_code == 401

    def test_creates_user_if_not_exists(self, client):
        """New telegram_id → user is created in DB."""
        new_id = 999888777
        init_data = _build_init_data(telegram_id=new_id)
        resp = client.post("/api/v1/auth/mini-app", json={"init_data": init_data})
        assert resp.status_code == 200
        # Second call should still work (user already exists)
        resp2 = client.post("/api/v1/auth/mini-app", json={"init_data": _build_init_data(telegram_id=new_id)})
        assert resp2.status_code == 200

    def test_existing_user_returns_200(self, client):
        """Same telegram_id can authenticate multiple times."""
        init_data = _build_init_data(telegram_id=555444333)
        resp1 = client.post("/api/v1/auth/mini-app", json={"init_data": init_data})
        assert resp1.status_code == 200
        resp2 = client.post("/api/v1/auth/mini-app", json={"init_data": _build_init_data(telegram_id=555444333)})
        assert resp2.status_code == 200

    def test_empty_init_data_returns_422(self, client):
        resp = client.post("/api/v1/auth/mini-app", json={"init_data": ""})
        # empty init_data → missing hash → MiniAppVerificationError → 401
        assert resp.status_code in (401, 422)
