"""JWT Service: создание и верификация токенов (D-01)."""
import uuid
from datetime import UTC, datetime, timedelta

from jose import jwt

from app.config import settings


class JWTService:
    def __init__(self) -> None:
        self._secret = settings.jwt_secret_key
        self._algorithm = settings.jwt_algorithm
        self._access_ttl = timedelta(minutes=settings.jwt_access_token_expire_minutes)
        self._refresh_ttl = timedelta(days=settings.jwt_refresh_token_expire_days)

    def create_access_token(
        self, user_id: str, expires_delta: timedelta | None = None
    ) -> str:
        ttl = expires_delta if expires_delta is not None else self._access_ttl
        payload = {
            "sub": user_id,
            "type": "access",
            "exp": datetime.now(UTC) + ttl,
        }
        return jwt.encode(payload, self._secret, algorithm=self._algorithm)

    def create_refresh_token(self, user_id: str, family_id: str) -> str:
        payload = {
            "sub": user_id,
            "type": "refresh",
            "family_id": family_id,
            "jti": str(uuid.uuid4()),
            "exp": datetime.now(UTC) + self._refresh_ttl,
        }
        return jwt.encode(payload, self._secret, algorithm=self._algorithm)

    def decode_token(self, token: str) -> dict:
        """Декодирует токен. Поднимает JWTError при невалидном или просроченном токене."""
        return jwt.decode(token, self._secret, algorithms=[self._algorithm])
