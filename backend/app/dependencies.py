from collections.abc import AsyncGenerator
from typing import Annotated
import uuid

import redis.asyncio as aioredis
from fastapi import Cookie, Depends, HTTPException, Request
from jose import JWTError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

# ─── Database ─────────────────────────────────────────────────────────────────

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_pre_ping=True,
)

AsyncSessionFactory = async_sessionmaker(
    engine,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionFactory() as session:
        yield session


DbSession = Annotated[AsyncSession, Depends(get_db)]

# ─── Redis ────────────────────────────────────────────────────────────────────

_redis_pool: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_pool


RedisClient = Annotated[aioredis.Redis, Depends(get_redis)]

# ─── S3 Client ────────────────────────────────────────────────────────────────


# ─── Auth dependencies ────────────────────────────────────────────────────────


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    access_token: str | None = Cookie(default=None),
):
    """Decode JWT from httpOnly cookie and return the authenticated User.

    Raises HTTP 401 if token is missing, invalid, expired, or user not found.
    """
    from app.models.user import User
    from app.services.auth.jwt_service import JWTService

    if access_token is None:
        raise HTTPException(status_code=401, detail="Не авторизован")

    jwt_service = JWTService()
    try:
        payload = jwt_service.decode_token(access_token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Недействительный токен")

    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Неверный тип токена")

    user_id_str: str | None = payload.get("sub")
    if not user_id_str:
        raise HTTPException(status_code=401, detail="Недействительный токен")

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="Недействительный токен")

    from sqlalchemy import select

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="Пользователь не найден")

    return user


async def get_current_user_optional(
    request: Request,
    db: AsyncSession = Depends(get_db),
    access_token: str | None = Cookie(default=None),
):
    """Like get_current_user but returns None instead of raising 401.

    Use for endpoints that work for both authenticated and anonymous users.
    """
    if access_token is None:
        return None
    try:
        return await get_current_user(request=request, db=db, access_token=access_token)
    except HTTPException:
        return None


CurrentUser = Annotated[object, Depends(get_current_user)]
OptionalUser = Annotated[object | None, Depends(get_current_user_optional)]


async def get_db_rls(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AsyncGenerator[AsyncSession, None]:
    """DB session with RLS context set from request.state.current_user_id.

    Runs SET LOCAL app.current_user_id = '<uuid>' so PostgreSQL RLS policies
    apply automatically for the duration of this request.
    """
    user_id = getattr(request.state, "current_user_id", None)
    if user_id:
        await db.execute(text(f"SET LOCAL app.current_user_id = '{user_id}'"))
    yield db


DbSessionRLS = Annotated[AsyncSession, Depends(get_db_rls)]


# ─── S3 Client ────────────────────────────────────────────────────────────────


def get_s3_client():  # type: ignore[return]
    """Returns boto3 S3 client configured for Yandex Object Storage.

    Import is deferred to avoid loading boto3 at startup when credentials
    are not available (e.g. during testing).
    """
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=settings.yos_endpoint,
        region_name=settings.yos_region,
        aws_access_key_id=settings.yos_access_key,
        aws_secret_access_key=settings.yos_secret_key,
    )
