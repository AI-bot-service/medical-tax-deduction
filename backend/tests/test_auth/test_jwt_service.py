"""
TDD tests for JWT Service (D-01).
Pure unit tests — no DB needed for JWT creation/decoding.
"""
import uuid
from datetime import timedelta

import pytest
from jose import JWTError

from app.services.auth.jwt_service import JWTService

USER_ID = str(uuid.uuid4())
FAMILY_ID = str(uuid.uuid4())


# ---------------------------------------------------------------------------
# create_access_token / decode_token
# ---------------------------------------------------------------------------


def test_create_access_token_returns_string():
    service = JWTService()
    token = service.create_access_token(USER_ID)
    assert isinstance(token, str)
    assert len(token) > 0


def test_decode_access_token_returns_correct_user_id():
    service = JWTService()
    token = service.create_access_token(USER_ID)
    payload = service.decode_token(token)
    assert payload["sub"] == USER_ID


def test_decode_access_token_has_type_access():
    service = JWTService()
    token = service.create_access_token(USER_ID)
    payload = service.decode_token(token)
    assert payload["type"] == "access"


def test_expired_access_token_raises_jwt_error():
    service = JWTService()
    token = service.create_access_token(USER_ID, expires_delta=timedelta(seconds=-1))
    with pytest.raises(JWTError):
        service.decode_token(token)


def test_invalid_token_string_raises_jwt_error():
    service = JWTService()
    with pytest.raises(JWTError):
        service.decode_token("not.a.valid.token")


def test_token_with_wrong_secret_raises_jwt_error():
    from jose import jwt as jose_jwt

    payload = {"sub": USER_ID, "type": "access"}
    token = jose_jwt.encode(payload, "totally-wrong-secret", algorithm="HS256")

    service = JWTService()
    with pytest.raises(JWTError):
        service.decode_token(token)


# ---------------------------------------------------------------------------
# create_refresh_token
# ---------------------------------------------------------------------------


def test_create_refresh_token_returns_string():
    service = JWTService()
    token = service.create_refresh_token(USER_ID, FAMILY_ID)
    assert isinstance(token, str)
    assert len(token) > 0


def test_decode_refresh_token_contains_user_id():
    service = JWTService()
    token = service.create_refresh_token(USER_ID, FAMILY_ID)
    payload = service.decode_token(token)
    assert payload["sub"] == USER_ID


def test_decode_refresh_token_contains_family_id():
    service = JWTService()
    token = service.create_refresh_token(USER_ID, FAMILY_ID)
    payload = service.decode_token(token)
    assert payload["family_id"] == FAMILY_ID


def test_decode_refresh_token_has_type_refresh():
    service = JWTService()
    token = service.create_refresh_token(USER_ID, FAMILY_ID)
    payload = service.decode_token(token)
    assert payload["type"] == "refresh"


def test_refresh_token_has_unique_jti():
    service = JWTService()
    token1 = service.create_refresh_token(USER_ID, FAMILY_ID)
    token2 = service.create_refresh_token(USER_ID, FAMILY_ID)
    payload1 = service.decode_token(token1)
    payload2 = service.decode_token(token2)
    assert "jti" in payload1
    assert payload1["jti"] != payload2["jti"]


def test_access_and_refresh_tokens_are_different():
    service = JWTService()
    access = service.create_access_token(USER_ID)
    refresh = service.create_refresh_token(USER_ID, FAMILY_ID)
    assert access != refresh
