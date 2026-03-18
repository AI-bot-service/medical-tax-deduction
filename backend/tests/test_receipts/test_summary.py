"""Tests for Summary Endpoint (E-02)."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.base import Base
from app.models.enums import OCRStatus
from app.models.receipt import Receipt
from app.models.user import User

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


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
async def test_user(db: AsyncSession) -> User:
    user = User(id=uuid.uuid4(), telegram_id=777888999, phone_hash="summary_hash")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
def app_client(engine, test_user):
    from app.routers.receipts import router
    from app.dependencies import get_db, get_current_user

    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_db():
        async with factory() as session:
            yield session

    async def override_user():
        return test_user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    return TestClient(app, raise_server_exceptions=True)


def _receipt(user_id, amount, status=OCRStatus.DONE, needs_rx=False,
             created_year=2024, created_month=1) -> Receipt:
    """Build a Receipt with a specific created_at timestamp."""
    r = Receipt(
        id=uuid.uuid4(),
        user_id=user_id,
        s3_key=f"receipts/{uuid.uuid4()}.jpg",
        ocr_status=status,
        total_amount=float(amount),
        needs_prescription=needs_rx,
    )
    # Override created_at via __dict__ (SQLite stores it as-is)
    r.created_at = datetime(created_year, created_month, 15, tzinfo=timezone.utc)
    return r


class TestSummaryEndpoint:
    @pytest.fixture
    async def receipts_2024(self, db: AsyncSession, test_user: User):
        """3 DONE receipts in Jan 2024, 1 REVIEW in Feb 2024, 1 PENDING (excluded)."""
        r1 = _receipt(test_user.id, 1000, created_year=2024, created_month=1)
        r2 = _receipt(test_user.id, 2000, created_year=2024, created_month=1)
        r3 = _receipt(test_user.id, 500, created_year=2024, created_month=1, needs_rx=True)
        r4 = _receipt(test_user.id, 3000, OCRStatus.REVIEW, created_year=2024, created_month=2)
        r5 = _receipt(test_user.id, 9999, OCRStatus.PENDING, created_year=2024, created_month=1)
        db.add_all([r1, r2, r3, r4, r5])
        await db.commit()
        return [r1, r2, r3, r4]

    def test_summary_returns_200(self, app_client):
        resp = app_client.get("/api/v1/receipts/summary?year=2024")
        assert resp.status_code == 200

    def test_summary_year_field(self, app_client, receipts_2024):
        resp = app_client.get("/api/v1/receipts/summary?year=2024")
        assert resp.json()["year"] == 2024

    def test_january_total_3500(self, app_client, receipts_2024):
        """1000 + 2000 + 500 = 3500 for January."""
        resp = app_client.get("/api/v1/receipts/summary?year=2024")
        data = resp.json()
        jan = next(m for m in data["months"] if m["month"] == "2024-01")
        assert float(jan["total_amount"]) == pytest.approx(3500.0)

    def test_january_receipts_count(self, app_client, receipts_2024):
        """3 DONE receipts in January (PENDING excluded)."""
        resp = app_client.get("/api/v1/receipts/summary?year=2024")
        jan = next(m for m in resp.json()["months"] if m["month"] == "2024-01")
        assert jan["receipts_count"] == 3

    def test_deduction_13_percent(self, app_client, receipts_2024):
        """3500 × 0.13 = 455.00"""
        resp = app_client.get("/api/v1/receipts/summary?year=2024")
        jan = next(m for m in resp.json()["months"] if m["month"] == "2024-01")
        assert float(jan["deduction_amount"]) == pytest.approx(455.0)

    def test_total_deduction(self, app_client, receipts_2024):
        """Total: 3500 + 3000 = 6500 → deduction 845.00"""
        resp = app_client.get("/api/v1/receipts/summary?year=2024")
        data = resp.json()
        assert float(data["total_amount"]) == pytest.approx(6500.0)
        assert float(data["deduction_amount"]) == pytest.approx(845.0)

    def test_has_missing_prescriptions_true(self, app_client, receipts_2024):
        """January has receipt with needs_prescription=True."""
        resp = app_client.get("/api/v1/receipts/summary?year=2024")
        jan = next(m for m in resp.json()["months"] if m["month"] == "2024-01")
        assert jan["has_missing_prescriptions"] is True

    def test_has_missing_prescriptions_false(self, app_client, receipts_2024):
        """February has no needs_prescription receipts."""
        resp = app_client.get("/api/v1/receipts/summary?year=2024")
        feb = next(m for m in resp.json()["months"] if m["month"] == "2024-02")
        assert feb["has_missing_prescriptions"] is False

    def test_pending_excluded_from_sum(self, app_client, receipts_2024):
        """PENDING receipt (9999) is not counted in total."""
        resp = app_client.get("/api/v1/receipts/summary?year=2024")
        assert float(resp.json()["total_amount"]) == pytest.approx(6500.0)

    def test_limit_used_pct(self, app_client, receipts_2024):
        """6500 / 150000 * 100 ≈ 4.33%"""
        resp = app_client.get("/api/v1/receipts/summary?year=2024")
        pct = resp.json()["limit_used_pct"]
        assert pct == pytest.approx(6500 / 150000 * 100, rel=0.01)

    def test_limit_capped_at_100(self, app_client, db, test_user):
        """If total > 150k, limit_used_pct = 100."""
        import asyncio

        async def _add():
            r = _receipt(test_user.id, 200000, created_year=2024, created_month=6)
            db.add(r)
            await db.commit()

        asyncio.get_event_loop().run_until_complete(_add())

        resp = app_client.get("/api/v1/receipts/summary?year=2024")
        assert resp.json()["limit_used_pct"] == 100.0

    def test_empty_year_returns_zeros(self, app_client):
        resp = app_client.get("/api/v1/receipts/summary?year=2099")
        data = resp.json()
        assert data["months"] == []
        assert float(data["total_amount"]) == 0.0
        assert data["limit_used_pct"] == 0.0
