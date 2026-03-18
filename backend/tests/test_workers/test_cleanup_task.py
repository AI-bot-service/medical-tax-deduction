"""
TDD tests for cleanup_task.py (A-06).
Tests verify that expired and used OTP codes are deleted,
while valid codes are preserved.
Uses SQLite in-memory database.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Base
from app.models.otp_code import OTPCode

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
async def engine():
    eng = create_async_engine(TEST_DB_URL, echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest.fixture
async def session(engine):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        yield s


def _make_otp(phone_hash: str, *, expired: bool = False, used: bool = False) -> OTPCode:
    now = datetime.now(timezone.utc)
    if expired:
        expires_at = now - timedelta(minutes=10)
    else:
        expires_at = now + timedelta(minutes=5)
    return OTPCode(
        id=uuid.uuid4(),
        phone_hash=phone_hash,
        code_hash="fakehash",
        expires_at=expires_at,
        attempts=0,
        used=used,
    )


# ---------------------------------------------------------------------------
# RED: tests that fail before implementation
# ---------------------------------------------------------------------------


async def test_cleanup_deletes_expired_otp_codes(session):
    """Expired OTP codes (expires_at < now) must be deleted."""
    from workers.tasks.cleanup_task import delete_expired_otps

    expired = _make_otp("phone1", expired=True)
    session.add(expired)
    await session.commit()

    count = await delete_expired_otps(session)

    assert count == 1


async def test_cleanup_deletes_used_otp_codes(session):
    """Used OTP codes must be deleted even if not yet expired."""
    from workers.tasks.cleanup_task import delete_expired_otps

    used = _make_otp("phone2", used=True)
    session.add(used)
    await session.commit()

    count = await delete_expired_otps(session)

    assert count == 1


async def test_cleanup_preserves_valid_otp_codes(session):
    """Valid (not expired, not used) OTP codes must NOT be deleted."""
    from workers.tasks.cleanup_task import delete_expired_otps

    valid = _make_otp("phone3")
    session.add(valid)
    await session.commit()

    count = await delete_expired_otps(session)

    assert count == 0


async def test_cleanup_deletes_both_expired_and_used(session):
    """Both expired and used codes are deleted in one call."""
    from workers.tasks.cleanup_task import delete_expired_otps

    expired = _make_otp("phone4", expired=True)
    used = _make_otp("phone5", used=True)
    valid = _make_otp("phone6")
    session.add_all([expired, used, valid])
    await session.commit()

    count = await delete_expired_otps(session)

    assert count == 2


async def test_cleanup_returns_zero_when_nothing_to_delete(session):
    """Returns 0 when there are no expired or used codes."""
    from workers.tasks.cleanup_task import delete_expired_otps

    count = await delete_expired_otps(session)

    assert count == 0
