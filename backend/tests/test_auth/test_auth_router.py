"""TDD tests for Auth Router (D-02).

Endpoints:
  POST /api/v1/auth/otp          — send OTP code via telegram
  POST /api/v1/auth/verify       — verify OTP, set httpOnly cookies
  POST /api/v1/auth/refresh      — refresh tokens (rotation)
  POST /api/v1/auth/logout       — clear cookies
  POST /api/v1/auth/bot-register — register/login via bot

Uses SQLite in-memory (StaticPool) for full isolation.
"""
import hashlib
import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.dependencies import get_db
from app.main import create_app
from app.models import Base
from app.models.otp_code import OTPCode
from app.models.user import User
from app.services.auth.jwt_service import JWTService

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"
PHONE = "+79001234567"
PHONE_HASH = hashlib.sha256(PHONE.encode()).hexdigest()
TELEGRAM_ID = 123456789

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def engine():
    eng = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest.fixture
def session_factory(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture
async def client(session_factory):
    app = create_app()

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


@pytest.fixture
async def user_in_db(session_factory):
    """Creates a test user with phone_hash."""
    async with session_factory() as session:
        user = User(telegram_id=TELEGRAM_ID, phone_hash=PHONE_HASH)
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


@pytest.fixture
async def otp_in_db(session_factory, user_in_db):
    """Creates a valid unexpired OTPCode with code='123456'."""
    code = "123456"
    code_hash = bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode()
    async with session_factory() as session:
        otp = OTPCode(
            phone_hash=PHONE_HASH,
            code_hash=code_hash,
            expires_at=datetime.now(UTC) + timedelta(minutes=5),
        )
        session.add(otp)
        await session.commit()
    return code


# ---------------------------------------------------------------------------
# POST /auth/otp
# ---------------------------------------------------------------------------


async def test_request_otp_for_known_user_returns_200(client, user_in_db):
    response = await client.post("/api/v1/auth/otp", json={"phone": PHONE})
    assert response.status_code == 200
    assert response.json()["message"] == "Код отправлен"


async def test_request_otp_for_unknown_user_returns_404(client):
    response = await client.post("/api/v1/auth/otp", json={"phone": "+79009999999"})
    assert response.status_code == 404


async def test_request_otp_invalid_phone_format_returns_422(client):
    response = await client.post("/api/v1/auth/otp", json={"phone": "89001234567"})
    assert response.status_code == 422


async def test_request_otp_short_phone_returns_422(client):
    response = await client.post("/api/v1/auth/otp", json={"phone": "+7123"})
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# POST /auth/verify
# ---------------------------------------------------------------------------


async def test_verify_correct_code_returns_200(client, otp_in_db):
    response = await client.post(
        "/api/v1/auth/verify", json={"phone": PHONE, "code": otp_in_db}
    )
    assert response.status_code == 200


async def test_verify_correct_code_sets_httponly_cookies(client, otp_in_db):
    response = await client.post(
        "/api/v1/auth/verify", json={"phone": PHONE, "code": otp_in_db}
    )
    assert "access_token" in response.cookies
    assert "refresh_token" in response.cookies


async def test_verify_wrong_code_returns_401(client, user_in_db, otp_in_db):
    response = await client.post(
        "/api/v1/auth/verify", json={"phone": PHONE, "code": "000000"}
    )
    assert response.status_code == 401


async def test_verify_unknown_phone_returns_401(client):
    response = await client.post(
        "/api/v1/auth/verify", json={"phone": "+79008887766", "code": "123456"}
    )
    assert response.status_code == 401


async def test_verify_used_code_returns_401(client, otp_in_db):
    # First verify succeeds
    await client.post("/api/v1/auth/verify", json={"phone": PHONE, "code": otp_in_db})
    # Second verify with same code must fail
    response = await client.post(
        "/api/v1/auth/verify", json={"phone": PHONE, "code": otp_in_db}
    )
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# POST /auth/refresh
# ---------------------------------------------------------------------------


async def test_refresh_with_valid_cookie_returns_200(client, user_in_db):
    jwt_service = JWTService()
    refresh_token = jwt_service.create_refresh_token(
        str(user_in_db.id), str(uuid.uuid4())
    )
    client.cookies.set("refresh_token", refresh_token)
    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 200


async def test_refresh_with_valid_cookie_sets_new_cookies(client, user_in_db):
    jwt_service = JWTService()
    refresh_token = jwt_service.create_refresh_token(
        str(user_in_db.id), str(uuid.uuid4())
    )
    client.cookies.set("refresh_token", refresh_token)
    response = await client.post("/api/v1/auth/refresh")
    assert "access_token" in response.cookies
    assert "refresh_token" in response.cookies


async def test_refresh_without_cookie_returns_401(client):
    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 401


async def test_refresh_with_invalid_token_returns_401(client):
    client.cookies.set("refresh_token", "invalid.token.here")
    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 401


async def test_refresh_with_access_token_as_refresh_returns_401(client, user_in_db):
    """Access token must not be accepted as refresh token."""
    jwt_service = JWTService()
    access_token = jwt_service.create_access_token(str(user_in_db.id))
    client.cookies.set("refresh_token", access_token)
    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# POST /auth/logout
# ---------------------------------------------------------------------------


async def test_logout_returns_200(client):
    response = await client.post("/api/v1/auth/logout")
    assert response.status_code == 200


async def test_logout_clears_cookies(client, user_in_db):
    jwt_service = JWTService()
    refresh_token = jwt_service.create_refresh_token(
        str(user_in_db.id), str(uuid.uuid4())
    )
    client.cookies.set("access_token", jwt_service.create_access_token(str(user_in_db.id)))
    client.cookies.set("refresh_token", refresh_token)

    response = await client.post("/api/v1/auth/logout")
    # Cookies should be deleted (set with max-age=0 or empty value)
    set_cookie_headers = response.headers.get_list("set-cookie")
    deleted = [h for h in set_cookie_headers if "Max-Age=0" in h or 'max-age=0' in h.lower()]
    assert len(deleted) >= 2


# ---------------------------------------------------------------------------
# POST /auth/bot-register
# ---------------------------------------------------------------------------


async def test_bot_register_new_user_returns_200(client):
    response = await client.post(
        "/api/v1/auth/bot-register",
        json={"telegram_id": 999888777, "phone": "+79005554433", "username": "testuser"},
    )
    assert response.status_code == 200


async def test_bot_register_new_user_returns_tokens(client):
    response = await client.post(
        "/api/v1/auth/bot-register",
        json={"telegram_id": 999888777, "phone": "+79005554433"},
    )
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


async def test_bot_register_existing_user_returns_tokens(client, user_in_db):
    response = await client.post(
        "/api/v1/auth/bot-register",
        json={"telegram_id": TELEGRAM_ID, "phone": PHONE},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data


async def test_bot_register_tokens_are_valid_jwt(client):
    response = await client.post(
        "/api/v1/auth/bot-register",
        json={"telegram_id": 111222333, "phone": "+79001112233"},
    )
    data = response.json()
    jwt_service = JWTService()
    payload = jwt_service.decode_token(data["access_token"])
    assert payload.get("sub") is not None
    assert payload.get("type") == "access"
