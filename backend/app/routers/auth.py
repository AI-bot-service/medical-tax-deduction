"""Auth Router (D-02).

Endpoints:
  POST /auth/otp          — generate OTP for a registered user, send via telegram
  POST /auth/verify       — verify OTP, issue httpOnly JWT cookies
  POST /auth/refresh      — rotate refresh token, issue new cookies
  POST /auth/logout       — clear auth cookies
  POST /auth/bot-register — register/find user from bot, return JWT in body
"""
import hashlib
import logging
import uuid

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.user import User
from app.schemas.auth import (
    BotRegisterRequest,
    BotTokenResponse,
    MessageResponse,
    OTPRequest,
    VerifyRequest,
)
from app.services.auth.jwt_service import JWTService
from app.services.auth.otp_service import OTPService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

_otp_service = OTPService()
_jwt_service = JWTService()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _hash_phone(phone: str) -> str:
    """Deterministic SHA-256 hash of phone number for DB lookups."""
    return hashlib.sha256(phone.encode()).hexdigest()


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="strict",
        max_age=15 * 60,  # 15 minutes
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="strict",
        max_age=30 * 24 * 3600,  # 30 days
    )


# ---------------------------------------------------------------------------
# POST /auth/otp
# ---------------------------------------------------------------------------


@router.post("/otp", response_model=MessageResponse)
async def request_otp(
    body: OTPRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Send a 6-digit OTP to the registered user's Telegram."""
    phone_hash = _hash_phone(body.phone)

    result = await db.execute(select(User).where(User.phone_hash == phone_hash))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    code = await _otp_service.generate_otp(phone_hash, db)

    # TODO: send via telegram_notifier (implemented in C-01)
    logger.info("OTP generated for telegram_id=%s (not sent yet)", user.telegram_id)
    _ = code  # will be passed to notifier once C-01 is done

    return MessageResponse(message="Код отправлен")


# ---------------------------------------------------------------------------
# POST /auth/verify
# ---------------------------------------------------------------------------


@router.post("/verify", response_model=MessageResponse)
async def verify_otp(
    body: VerifyRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Verify OTP code and set httpOnly JWT cookies on success."""
    phone_hash = _hash_phone(body.phone)

    result = await db.execute(select(User).where(User.phone_hash == phone_hash))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="Неверный телефон или код")

    is_valid = await _otp_service.verify_otp(phone_hash, body.code, db)
    if not is_valid:
        raise HTTPException(status_code=401, detail="Неверный код")

    user_id = str(user.id)
    family_id = str(uuid.uuid4())
    access_token = _jwt_service.create_access_token(user_id)
    refresh_token = _jwt_service.create_refresh_token(user_id, family_id)

    _set_auth_cookies(response, access_token, refresh_token)
    return MessageResponse(message="Авторизация успешна")


# ---------------------------------------------------------------------------
# POST /auth/refresh
# ---------------------------------------------------------------------------


@router.post("/refresh", response_model=MessageResponse)
async def refresh_tokens(
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Rotate refresh token and issue new httpOnly JWT cookies."""
    if refresh_token is None:
        raise HTTPException(status_code=401, detail="Refresh token не найден")

    try:
        payload = _jwt_service.decode_token(refresh_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Неверный токен")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Неверный тип токена")

    user_id: str = payload["sub"]
    new_family_id = str(uuid.uuid4())
    new_access = _jwt_service.create_access_token(user_id)
    new_refresh = _jwt_service.create_refresh_token(user_id, new_family_id)

    _set_auth_cookies(response, new_access, new_refresh)
    return MessageResponse(message="Токены обновлены")


# ---------------------------------------------------------------------------
# POST /auth/logout
# ---------------------------------------------------------------------------


@router.post("/logout", response_model=MessageResponse)
async def logout(response: Response) -> MessageResponse:
    """Clear auth cookies."""
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return MessageResponse(message="Выход выполнен")


# ---------------------------------------------------------------------------
# POST /auth/bot-register
# ---------------------------------------------------------------------------


@router.post("/bot-register", response_model=BotTokenResponse)
async def bot_register(
    body: BotRegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> BotTokenResponse:
    """Register or find a user from the Telegram bot; return JWT in response body."""
    phone_hash = _hash_phone(body.phone)

    result = await db.execute(select(User).where(User.telegram_id == body.telegram_id))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            telegram_id=body.telegram_id,
            phone_hash=phone_hash,
            telegram_username=body.username,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        # Update phone_hash and username if provided
        user.phone_hash = phone_hash
        if body.username is not None:
            user.telegram_username = body.username
        await db.commit()

    user_id = str(user.id)
    family_id = str(uuid.uuid4())
    access_token = _jwt_service.create_access_token(user_id)
    refresh_token = _jwt_service.create_refresh_token(user_id, family_id)

    return BotTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )
