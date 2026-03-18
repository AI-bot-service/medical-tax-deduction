"""Cleanup Task (A-06).

Celery beat periodic task that removes expired and used OTP codes
to keep the otp_codes table small and fast.

Schedule: every 15 minutes (configured in celery_app.py beat_schedule).

Public helpers:
    delete_expired_otps(session) → int   # used in tests and Celery task
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import delete, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from workers.celery_app import celery_app

logger = logging.getLogger(__name__)


async def delete_expired_otps(session: AsyncSession) -> int:
    """Delete OTP codes that are expired or already used.

    Args:
        session: async SQLAlchemy session (must be provided by caller)

    Returns:
        Number of rows deleted.
    """
    from app.models.otp_code import OTPCode

    stmt = delete(OTPCode).where(
        or_(
            OTPCode.expires_at < func.now(),
            OTPCode.used.is_(True),
        )
    )
    result = await session.execute(stmt)
    await session.commit()
    return result.rowcount


@celery_app.task(name="workers.tasks.cleanup_task.cleanup_expired_otps")
def cleanup_expired_otps() -> dict:
    """Celery beat task: clean expired/used OTP codes."""
    return asyncio.run(_run())


async def _run() -> dict:
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

    from app.config import settings

    engine = create_async_engine(settings.database_url, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with factory() as session:
            deleted = await delete_expired_otps(session)
    finally:
        await engine.dispose()

    logger.info("cleanup_expired_otps: deleted %d rows", deleted)
    return {"deleted": deleted}
