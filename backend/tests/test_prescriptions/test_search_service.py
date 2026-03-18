"""Tests for Prescription Search Service L1-L4 (E-04)."""
from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.base import Base
from app.models.enums import DocType, RiskLevel
from app.models.prescription import Prescription
from app.models.user import User
from app.services.prescriptions.search_service import (
    PrescriptionSearchResult,
    find_prescription,
)

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

TODAY = date(2024, 3, 15)
INN_IBUPROFEN = "ибупрофен"
INN_ASPIRIN = "ацетилсалициловая кислота"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def engine():
    eng = create_async_engine(TEST_DB_URL)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest.fixture
async def db(engine):
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest.fixture
async def user(db: AsyncSession) -> User:
    u = User(id=uuid.uuid4(), telegram_id=555111222, phone_hash="search_hash")
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


def _presc(
    user_id,
    drug_inn: str,
    drug_name: str,
    issue_date: date,
    expires_at: date,
    status: str = "active",
) -> Prescription:
    return Prescription(
        id=uuid.uuid4(),
        user_id=user_id,
        doc_type=DocType.RECIPE_107,
        doctor_name="Тестовый Врач",
        issue_date=issue_date,
        expires_at=expires_at,
        drug_name=drug_name,
        drug_inn=drug_inn,
        risk_level=RiskLevel.STANDARD,
        status=status,
    )


# ---------------------------------------------------------------------------
# L1 tests
# ---------------------------------------------------------------------------


class TestL1Match:
    @pytest.fixture
    async def active_rx(self, db: AsyncSession, user: User) -> Prescription:
        """Prescription valid on TODAY."""
        p = _presc(
            user.id,
            INN_IBUPROFEN,
            "Ибупрофен",
            issue_date=TODAY - timedelta(days=10),
            expires_at=TODAY + timedelta(days=50),
        )
        db.add(p)
        await db.commit()
        return p

    @pytest.mark.anyio
    async def test_l1_exact_inn_in_period(self, db, user, active_rx):
        result = await find_prescription(user.id, INN_IBUPROFEN, "Ибупрофен", TODAY, db)
        assert result is not None
        assert result.match_level == "L1"
        assert result.confidence_score == 1.0
        assert result.days_overdue is None
        assert result.prescription.id == active_rx.id

    @pytest.mark.anyio
    async def test_l1_purchase_on_issue_date(self, db, user, active_rx):
        """Purchase exactly on issue_date → L1."""
        result = await find_prescription(
            user.id, INN_IBUPROFEN, "Ибупрофен",
            active_rx.issue_date, db
        )
        assert result is not None
        assert result.match_level == "L1"

    @pytest.mark.anyio
    async def test_l1_purchase_on_expiry_date(self, db, user, active_rx):
        """Purchase exactly on expires_at → L1."""
        result = await find_prescription(
            user.id, INN_IBUPROFEN, "Ибупрофен",
            active_rx.expires_at, db
        )
        assert result is not None
        assert result.match_level == "L1"

    @pytest.mark.anyio
    async def test_l1_wrong_inn_no_match(self, db, user, active_rx):
        """Different INN → no L1 match."""
        result = await find_prescription(
            user.id, INN_ASPIRIN, "Аспирин", TODAY, db
        )
        # Falls through to L3 fuzzy at most
        assert result is None or result.match_level != "L1"

    @pytest.mark.anyio
    async def test_l1_deleted_prescription_skipped(self, db, user):
        """Deleted prescriptions are not matched."""
        p = _presc(
            user.id, INN_IBUPROFEN, "Ибупрофен",
            issue_date=TODAY - timedelta(days=10),
            expires_at=TODAY + timedelta(days=50),
            status="deleted",
        )
        db.add(p)
        await db.commit()
        result = await find_prescription(user.id, INN_IBUPROFEN, "Ибупрофен", TODAY, db)
        assert result is None


# ---------------------------------------------------------------------------
# L2 tests
# ---------------------------------------------------------------------------


class TestL2Match:
    @pytest.fixture
    async def expired_rx(self, db: AsyncSession, user: User) -> Prescription:
        """Prescription expired 15 days before TODAY."""
        p = _presc(
            user.id,
            INN_IBUPROFEN,
            "Ибупрофен",
            issue_date=TODAY - timedelta(days=75),
            expires_at=TODAY - timedelta(days=15),
        )
        db.add(p)
        await db.commit()
        return p

    @pytest.mark.anyio
    async def test_l2_overdue_15_days(self, db, user, expired_rx):
        result = await find_prescription(user.id, INN_IBUPROFEN, "Ибупрофен", TODAY, db)
        assert result is not None
        assert result.match_level == "L2"
        assert result.days_overdue == 15
        assert result.confidence_score == 0.85

    @pytest.mark.anyio
    async def test_l2_overdue_exactly_30_days(self, db, user):
        """Expired exactly 30 days ago → still L2."""
        p = _presc(
            user.id, INN_IBUPROFEN, "Ибупрофен",
            issue_date=TODAY - timedelta(days=90),
            expires_at=TODAY - timedelta(days=30),
        )
        db.add(p)
        await db.commit()
        result = await find_prescription(user.id, INN_IBUPROFEN, "Ибупрофен", TODAY, db)
        assert result is not None
        assert result.match_level == "L2"
        assert result.days_overdue == 30

    @pytest.mark.anyio
    async def test_l2_overdue_31_days_no_match(self, db, user):
        """Expired 31 days ago → no L2 match."""
        p = _presc(
            user.id, INN_IBUPROFEN, "Ибупрофен",
            issue_date=TODAY - timedelta(days=91),
            expires_at=TODAY - timedelta(days=31),
        )
        db.add(p)
        await db.commit()
        result = await find_prescription(user.id, INN_IBUPROFEN, "Ибупрофен", TODAY, db)
        # Might match L3 by name, but not L2
        assert result is None or result.match_level != "L2"


# ---------------------------------------------------------------------------
# L3 tests
# ---------------------------------------------------------------------------


class TestL3Match:
    @pytest.fixture
    async def nurofen_rx(self, db: AsyncSession, user: User) -> Prescription:
        """Prescription for 'Нурофен' (brand of ibuprofen)."""
        p = _presc(
            user.id,
            INN_IBUPROFEN,
            "Нурофен",
            issue_date=TODAY - timedelta(days=10),
            expires_at=TODAY + timedelta(days=50),
        )
        # Wipe drug_inn to force fall-through to L3
        p.drug_inn = None
        db.add(p)
        await db.commit()
        return p

    @pytest.mark.anyio
    async def test_l3_fuzzy_nurofen_matches_nurofen_express(self, db, user, nurofen_rx):
        """'НУРОФЕН ЭКСПРЕСС' fuzzy-matches 'Нурофен'."""
        result = await find_prescription(
            user.id, None, "НУРОФЕН ЭКСПРЕСС", TODAY, db
        )
        assert result is not None
        assert result.match_level == "L3"
        assert result.confidence_score >= 0.85

    @pytest.mark.anyio
    async def test_l3_exact_name_match(self, db, user, nurofen_rx):
        result = await find_prescription(user.id, None, "Нурофен", TODAY, db)
        assert result is not None
        assert result.match_level == "L3"

    @pytest.mark.anyio
    async def test_l3_unrelated_name_no_match(self, db, user, nurofen_rx):
        result = await find_prescription(user.id, None, "Амоксициллин таблетки 500мг", TODAY, db)
        assert result is None


# ---------------------------------------------------------------------------
# L4 tests
# ---------------------------------------------------------------------------


class TestL4NoMatch:
    @pytest.mark.anyio
    async def test_l4_empty_db(self, db, user):
        result = await find_prescription(user.id, INN_IBUPROFEN, "Ибупрофен", TODAY, db)
        assert result is None

    @pytest.mark.anyio
    async def test_l4_no_inn_no_match(self, db, user):
        result = await find_prescription(user.id, None, "абракадабра123", TODAY, db)
        assert result is None

    @pytest.mark.anyio
    async def test_l4_no_purchase_date_skips_l1_l2(self, db, user):
        """No purchase_date → L1/L2 skipped, L3 attempted."""
        p = _presc(
            user.id, INN_IBUPROFEN, "Ибупрофен",
            issue_date=TODAY - timedelta(days=10),
            expires_at=TODAY + timedelta(days=50),
        )
        db.add(p)
        await db.commit()
        # No purchase_date → can't do L1/L2; L3 should match by name
        result = await find_prescription(user.id, INN_IBUPROFEN, "Ибупрофен", None, db)
        # L3 should find it
        assert result is not None
        assert result.match_level == "L3"
