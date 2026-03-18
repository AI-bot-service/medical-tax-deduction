"""Tests for RLSMiddleware and get_current_user dependency (D-03)."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.middleware.rls import RLSMiddleware
from app.services.auth.jwt_service import JWTService


# ---------------------------------------------------------------------------
# Helper: minimal FastAPI app with RLSMiddleware and an echo endpoint
# ---------------------------------------------------------------------------


def _make_app() -> FastAPI:
    """Create a minimal FastAPI app with RLSMiddleware for testing."""
    app = FastAPI()
    app.add_middleware(RLSMiddleware)

    @app.get("/api/v1/protected")
    async def protected(request: Request):
        return {"user_id": request.state.current_user_id}

    @app.get("/api/v1/health")
    async def health(request: Request):
        return {"user_id": request.state.current_user_id}

    @app.get("/api/v1/auth/otp")
    async def auth_otp(request: Request):
        return {"user_id": request.state.current_user_id}

    return app


_jwt_service = JWTService()


# ---------------------------------------------------------------------------
# RLSMiddleware tests
# ---------------------------------------------------------------------------


class TestRLSMiddleware:
    def setup_method(self):
        self.app = _make_app()
        self.client = TestClient(self.app, raise_server_exceptions=True)

    def test_no_cookie_sets_none(self):
        """Request without access_token cookie → user_id = None."""
        resp = self.client.get("/api/v1/protected")
        assert resp.status_code == 200
        assert resp.json()["user_id"] is None

    def test_valid_token_sets_user_id(self):
        """Valid access_token cookie → user_id extracted and stored."""
        user_id = str(uuid.uuid4())
        token = _jwt_service.create_access_token(user_id)

        resp = self.client.get(
            "/api/v1/protected", cookies={"access_token": token}
        )
        assert resp.status_code == 200
        assert resp.json()["user_id"] == user_id

    def test_invalid_token_sets_none(self):
        """Invalid/garbage token → user_id = None (no exception)."""
        resp = self.client.get(
            "/api/v1/protected", cookies={"access_token": "not.a.valid.token"}
        )
        assert resp.status_code == 200
        assert resp.json()["user_id"] is None

    def test_refresh_token_type_sets_none(self):
        """Refresh token (type=refresh) must NOT populate user_id."""
        user_id = str(uuid.uuid4())
        token = _jwt_service.create_refresh_token(user_id, str(uuid.uuid4()))

        resp = self.client.get(
            "/api/v1/protected", cookies={"access_token": token}
        )
        assert resp.status_code == 200
        assert resp.json()["user_id"] is None

    def test_health_path_skipped(self):
        """Health endpoint sets request.state.current_user_id = None (path skipped)."""
        user_id = str(uuid.uuid4())
        token = _jwt_service.create_access_token(user_id)

        # Even with a valid token, /health path is skipped — state is not populated
        # by the middleware (but the value is still None by default from the endpoint)
        resp = self.client.get("/api/v1/health", cookies={"access_token": token})
        assert resp.status_code == 200
        # The middleware skips this path, so state.current_user_id remains None
        assert resp.json()["user_id"] is None

    def test_auth_path_skipped(self):
        """Auth endpoints are skipped — middleware does NOT decode token."""
        user_id = str(uuid.uuid4())
        token = _jwt_service.create_access_token(user_id)

        resp = self.client.get("/api/v1/auth/otp", cookies={"access_token": token})
        assert resp.status_code == 200
        assert resp.json()["user_id"] is None


# ---------------------------------------------------------------------------
# get_current_user dependency tests (unit-level, mock DB)
# ---------------------------------------------------------------------------


class TestGetCurrentUser:
    @pytest.mark.anyio
    async def test_no_cookie_raises_401(self):
        """Missing access_token cookie → 401."""
        from fastapi import HTTPException

        from app.dependencies import get_current_user

        mock_request = MagicMock()
        mock_db = AsyncMock()

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(request=mock_request, db=mock_db, access_token=None)
        assert exc_info.value.status_code == 401

    @pytest.mark.anyio
    async def test_invalid_token_raises_401(self):
        """Garbage token → 401."""
        from fastapi import HTTPException

        from app.dependencies import get_current_user

        mock_request = MagicMock()
        mock_db = AsyncMock()

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(
                request=mock_request, db=mock_db, access_token="bad.token.here"
            )
        assert exc_info.value.status_code == 401

    @pytest.mark.anyio
    async def test_refresh_token_raises_401(self):
        """Refresh token passed as access_token → 401 (wrong type)."""
        from fastapi import HTTPException

        from app.dependencies import get_current_user

        user_id = str(uuid.uuid4())
        refresh_token = _jwt_service.create_refresh_token(user_id, str(uuid.uuid4()))

        mock_request = MagicMock()
        mock_db = AsyncMock()

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(
                request=mock_request, db=mock_db, access_token=refresh_token
            )
        assert exc_info.value.status_code == 401

    @pytest.mark.anyio
    async def test_valid_token_user_not_found_raises_401(self):
        """Valid token but user not in DB → 401."""
        from fastapi import HTTPException
        from sqlalchemy.ext.asyncio import AsyncSession

        from app.dependencies import get_current_user

        user_id = str(uuid.uuid4())
        access_token = _jwt_service.create_access_token(user_id)

        mock_request = MagicMock()

        # Mock db.execute → scalar_one_or_none returns None
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db = AsyncMock(spec=AsyncSession)
        mock_db.execute.return_value = mock_result

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(
                request=mock_request, db=mock_db, access_token=access_token
            )
        assert exc_info.value.status_code == 401

    @pytest.mark.anyio
    async def test_valid_token_returns_user(self):
        """Valid token + user exists in DB → user returned."""
        from sqlalchemy.ext.asyncio import AsyncSession

        from app.dependencies import get_current_user

        user_id = str(uuid.uuid4())
        access_token = _jwt_service.create_access_token(user_id)

        mock_request = MagicMock()

        # Mock user object
        mock_user = MagicMock()
        mock_user.id = uuid.UUID(user_id)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_user
        mock_db = AsyncMock(spec=AsyncSession)
        mock_db.execute.return_value = mock_result

        result = await get_current_user(
            request=mock_request, db=mock_db, access_token=access_token
        )
        assert result is mock_user


# ---------------------------------------------------------------------------
# get_current_user_optional dependency tests
# ---------------------------------------------------------------------------


class TestGetCurrentUserOptional:
    @pytest.mark.anyio
    async def test_no_cookie_returns_none(self):
        """Missing token → None (no exception)."""
        from app.dependencies import get_current_user_optional

        mock_request = MagicMock()
        mock_db = AsyncMock()

        result = await get_current_user_optional(
            request=mock_request, db=mock_db, access_token=None
        )
        assert result is None

    @pytest.mark.anyio
    async def test_invalid_token_returns_none(self):
        """Invalid token → None (no exception)."""
        from app.dependencies import get_current_user_optional

        mock_request = MagicMock()
        mock_db = AsyncMock()

        result = await get_current_user_optional(
            request=mock_request, db=mock_db, access_token="bad.token"
        )
        assert result is None
