"""RLS Middleware (D-03).

Extracts user_id from access_token cookie and stores it in request.state.
Protected DB dependencies then execute SET LOCAL app.current_user_id before queries.
Auth and health endpoints are skipped (they don't need RLS).
"""
import logging

from jose import JWTError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from app.config import settings

logger = logging.getLogger(__name__)

# Paths that do NOT require user context (auth bootstraps itself, health is public)
_SKIP_PREFIXES = ("/api/v1/auth/", "/api/v1/health")


class RLSMiddleware(BaseHTTPMiddleware):
    """Populate request.state.current_user_id from JWT access_token cookie.

    Downstream dependencies read this value and issue:
        SET LOCAL app.current_user_id = '<uuid>'
    before any query so that PostgreSQL RLS policies take effect.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        # Import here to avoid circular imports at module load time
        from jose import jwt as _jwt

        self._jwt = _jwt
        self._secret = settings.jwt_secret_key
        self._algorithm = settings.jwt_algorithm

    async def dispatch(self, request: Request, call_next) -> Response:
        request.state.current_user_id = None

        # Skip paths that don't need RLS
        path = request.url.path
        if any(path.startswith(prefix) for prefix in _SKIP_PREFIXES):
            return await call_next(request)

        token = request.cookies.get("access_token")
        if token:
            try:
                payload = self._jwt.decode(token, self._secret, algorithms=[self._algorithm])
                if payload.get("type") == "access":
                    request.state.current_user_id = payload.get("sub")
            except JWTError:
                pass  # Invalid/expired token — leave user_id as None

        return await call_next(request)
