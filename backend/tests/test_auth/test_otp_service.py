"""
TDD tests for OTP Service (D-01).
Uses SQLite in-memory DB to verify OTP generation and verification logic.
"""
import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Base
from app.models.otp_code import OTPCode
from app.services.auth.otp_service import OTPService

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

PHONE_HASH = "bcrypt_hashed_phone_number_1234567890abcdef"


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


# ---------------------------------------------------------------------------
# generate_otp tests
# ---------------------------------------------------------------------------


async def test_generate_otp_returns_six_digit_code(session):
    service = OTPService()
    code = await service.generate_otp(PHONE_HASH, session)
    assert len(code) == 6
    assert code.isdigit()


async def test_generate_otp_creates_record_in_db(session):
    service = OTPService()
    await service.generate_otp(PHONE_HASH, session)
    result = await session.execute(
        select(OTPCode).where(OTPCode.phone_hash == PHONE_HASH, OTPCode.used.is_(False))
    )
    otp = result.scalar_one_or_none()
    assert otp is not None
    assert otp.attempts == 0


async def test_generate_otp_stores_hash_not_plaintext(session):
    service = OTPService()
    code = await service.generate_otp(PHONE_HASH, session)
    result = await session.execute(
        select(OTPCode).where(OTPCode.phone_hash == PHONE_HASH)
    )
    otp = result.scalar_one()
    # code_hash must NOT be the plaintext code
    assert otp.code_hash != code


async def test_generate_otp_invalidates_previous_code(session):
    service = OTPService()
    first_code = await service.generate_otp(PHONE_HASH, session)
    await service.generate_otp(PHONE_HASH, session)

    # Trying to verify the first code must fail (it was invalidated)
    result = await service.verify_otp(PHONE_HASH, first_code, session)
    assert result is False


# ---------------------------------------------------------------------------
# verify_otp tests
# ---------------------------------------------------------------------------


async def test_verify_otp_with_correct_code_returns_true(session):
    service = OTPService()
    code = await service.generate_otp(PHONE_HASH, session)
    result = await service.verify_otp(PHONE_HASH, code, session)
    assert result is True


async def test_verify_otp_marks_otp_as_used(session):
    service = OTPService()
    code = await service.generate_otp(PHONE_HASH, session)
    await service.verify_otp(PHONE_HASH, code, session)

    result = await session.execute(
        select(OTPCode).where(OTPCode.phone_hash == PHONE_HASH)
    )
    otp = result.scalar_one()
    assert otp.used is True


async def test_verify_otp_already_used_returns_false(session):
    service = OTPService()
    code = await service.generate_otp(PHONE_HASH, session)
    await service.verify_otp(PHONE_HASH, code, session)
    # Second verify with same code must fail
    result = await service.verify_otp(PHONE_HASH, code, session)
    assert result is False


async def test_verify_otp_wrong_code_returns_false(session):
    service = OTPService()
    await service.generate_otp(PHONE_HASH, session)
    result = await service.verify_otp(PHONE_HASH, "000000", session)
    assert result is False


async def test_verify_otp_wrong_code_increments_attempts(session):
    service = OTPService()
    await service.generate_otp(PHONE_HASH, session)
    await service.verify_otp(PHONE_HASH, "000000", session)

    result = await session.execute(
        select(OTPCode).where(OTPCode.phone_hash == PHONE_HASH)
    )
    otp = result.scalar_one()
    assert otp.attempts == 1


async def test_verify_otp_no_otp_returns_false(session):
    service = OTPService()
    result = await service.verify_otp("nonexistent_hash", "123456", session)
    assert result is False


async def test_verify_otp_five_wrong_attempts_raises_429_on_sixth(session):
    """After 5 failed attempts the 6th call must raise HTTP 429."""
    service = OTPService()
    await service.generate_otp(PHONE_HASH, session)

    # 5 wrong attempts must all return False
    for _ in range(5):
        result = await service.verify_otp(PHONE_HASH, "000000", session)
        assert result is False

    # 6th wrong attempt must raise HTTP 429
    with pytest.raises(HTTPException) as exc_info:
        await service.verify_otp(PHONE_HASH, "000000", session)
    assert exc_info.value.status_code == 429
