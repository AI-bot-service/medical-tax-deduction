from collections.abc import AsyncGenerator
from typing import Annotated

import redis.asyncio as aioredis
from fastapi import Depends
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
