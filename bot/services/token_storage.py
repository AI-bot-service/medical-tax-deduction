"""Redis-based JWT token persistence for bot users.

Tokens are stored under key bot:tokens:{telegram_id} as a hash
with fields access_token and refresh_token. TTL = 31 days.
"""
import json
import logging

import redis

from config import config

logger = logging.getLogger(__name__)

_TOKEN_TTL = 31 * 24 * 3600  # 31 days in seconds
_KEY_PREFIX = "bot:tokens:"


def _client() -> redis.Redis:
    return redis.from_url(config.REDIS_URL, decode_responses=True)


def save_tokens(telegram_id: int, access_token: str, refresh_token: str) -> None:
    try:
        r = _client()
        r.setex(
            f"{_KEY_PREFIX}{telegram_id}",
            _TOKEN_TTL,
            json.dumps({"access_token": access_token, "refresh_token": refresh_token}),
        )
    except Exception as exc:
        logger.warning("Failed to save tokens to Redis for user %s: %s", telegram_id, exc)


def load_tokens(telegram_id: int) -> tuple[str, str] | None:
    """Return (access_token, refresh_token) or None if not found."""
    try:
        r = _client()
        value = r.get(f"{_KEY_PREFIX}{telegram_id}")
        if value:
            data = json.loads(value)
            return data["access_token"], data["refresh_token"]
    except Exception as exc:
        logger.warning("Failed to load tokens from Redis for user %s: %s", telegram_id, exc)
    return None


def delete_tokens(telegram_id: int) -> None:
    try:
        r = _client()
        r.delete(f"{_KEY_PREFIX}{telegram_id}")
    except Exception as exc:
        logger.warning("Failed to delete tokens from Redis for user %s: %s", telegram_id, exc)
