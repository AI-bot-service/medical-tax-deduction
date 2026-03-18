"""Tests for Prescriptions Router (E-03).

Uses SQLite in-memory DB and mocked S3.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.base import Base
from app.models.enums import DocType, OCRStatus, RiskLevel
from app.models.prescription import Prescription
from app.models.receipt import Receipt
from app.models.receipt_item import ReceiptItem
from app.models.user import User

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


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
async def test_user(db: AsyncSession) -> User:
    user = User(id=uuid.uuid4(), telegram_id=111222333, phone_hash="hash_test")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
async def other_user(db: AsyncSession) -> User:
    user = User(id=uuid.uuid4(), telegram_id=999888777, phone_hash="hash_other")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture
def app_client(engine, test_user):
    from app.routers.prescriptions import router
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


@pytest.fixture
def other_client(engine, other_user):
    from app.routers.prescriptions import router
    from app.dependencies import get_db, get_current_user

    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_db():
        async with factory() as session:
            yield session

    async def override_user():
        return other_user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user

    return TestClient(app, raise_server_exceptions=True)


def _rx_body(**kwargs) -> dict:
    defaults = {
        "doc_type": "recipe_107",
        "doctor_name": "Иванов И.И.",
        "issue_date": "2024-01-15",
        "drug_name": "Амоксициллин",
    }
    defaults.update(kwargs)
    return defaults


# ---------------------------------------------------------------------------
# POST /prescriptions
# ---------------------------------------------------------------------------


class TestCreatePrescription:
    def test_create_returns_201(self, app_client):
        resp = app_client.post("/api/v1/prescriptions", json=_rx_body())
        assert resp.status_code == 201

    def test_expires_at_defaults_to_60_days(self, app_client):
        """No expires_at → issue_date + 60 days."""
        resp = app_client.post("/api/v1/prescriptions", json=_rx_body(issue_date="2024-01-15"))
        assert resp.status_code == 201
        data = resp.json()
        assert data["expires_at"] == "2024-03-15"

    def test_explicit_expires_at_respected(self, app_client):
        resp = app_client.post(
            "/api/v1/prescriptions",
            json=_rx_body(issue_date="2024-01-15", expires_at="2024-06-01"),
        )
        assert resp.status_code == 201
        assert resp.json()["expires_at"] == "2024-06-01"

    def test_doc_025_sets_disputed(self, app_client):
        """doc_type doc_025 → risk_level = DISPUTED."""
        resp = app_client.post("/api/v1/prescriptions", json=_rx_body(doc_type="doc_025"))
        assert resp.status_code == 201
        assert resp.json()["risk_level"] == "DISPUTED"

    def test_doc_025_1_sets_disputed(self, app_client):
        """doc_type doc_025_1 → risk_level = DISPUTED."""
        resp = app_client.post("/api/v1/prescriptions", json=_rx_body(doc_type="doc_025_1"))
        assert resp.status_code == 201
        assert resp.json()["risk_level"] == "DISPUTED"

    def test_recipe_107_is_standard(self, app_client):
        """Normal 107-1/у → risk_level = STANDARD."""
        resp = app_client.post("/api/v1/prescriptions", json=_rx_body(doc_type="recipe_107"))
        assert resp.status_code == 201
        assert resp.json()["risk_level"] == "STANDARD"

    def test_status_is_active(self, app_client):
        resp = app_client.post("/api/v1/prescriptions", json=_rx_body())
        assert resp.json()["status"] == "active"

    def test_drug_inn_optional(self, app_client):
        resp = app_client.post("/api/v1/prescriptions", json=_rx_body(drug_name="Ибупрофен"))
        assert resp.status_code == 201
        assert resp.json()["drug_inn"] is None


# ---------------------------------------------------------------------------
# GET /prescriptions
# ---------------------------------------------------------------------------


class TestListPrescriptions:
    @pytest.fixture
    async def prescriptions(self, db: AsyncSession, test_user: User):
        today = date.today()
        r1 = Prescription(
            id=uuid.uuid4(),
            user_id=test_user.id,
            doc_type=DocType.RECIPE_107,
            doctor_name="Врач А",
            issue_date=today - timedelta(days=30),
            expires_at=today + timedelta(days=30),
            drug_name="Препарат А",
            risk_level=RiskLevel.STANDARD,
            status="active",
        )
        r2 = Prescription(
            id=uuid.uuid4(),
            user_id=test_user.id,
            doc_type=DocType.DOC_025,
            doctor_name="Врач Б",
            issue_date=today - timedelta(days=100),
            expires_at=today - timedelta(days=40),  # expired
            drug_name="Препарат Б",
            risk_level=RiskLevel.DISPUTED,
            status="active",
        )
        db.add_all([r1, r2])
        await db.commit()
        return [r1, r2]

    def test_list_all(self, app_client, prescriptions):
        resp = app_client.get("/api/v1/prescriptions")
        assert resp.status_code == 200
        assert resp.json()["total"] == 2

    def test_filter_by_doc_type(self, app_client, prescriptions):
        resp = app_client.get("/api/v1/prescriptions?doc_type=recipe_107")
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["doc_type"] == "recipe_107"

    def test_filter_active(self, app_client, prescriptions):
        resp = app_client.get("/api/v1/prescriptions?status=active")
        assert resp.json()["total"] == 1

    def test_filter_expired(self, app_client, prescriptions):
        resp = app_client.get("/api/v1/prescriptions?status=expired")
        assert resp.json()["total"] == 1

    def test_empty_for_new_user(self, app_client):
        resp = app_client.get("/api/v1/prescriptions")
        assert resp.json()["total"] == 0


# ---------------------------------------------------------------------------
# GET /prescriptions/{id}
# ---------------------------------------------------------------------------


class TestGetPrescription:
    @pytest.fixture
    async def prescription(self, db: AsyncSession, test_user: User) -> Prescription:
        today = date.today()
        p = Prescription(
            id=uuid.uuid4(),
            user_id=test_user.id,
            doc_type=DocType.RECIPE_107,
            doctor_name="Петров П.П.",
            issue_date=today,
            expires_at=today + timedelta(days=60),
            drug_name="Кларитромицин",
            risk_level=RiskLevel.STANDARD,
            status="active",
        )
        db.add(p)
        await db.commit()
        await db.refresh(p)
        return p

    def test_get_own_prescription(self, app_client, prescription):
        resp = app_client.get(f"/api/v1/prescriptions/{prescription.id}")
        assert resp.status_code == 200
        assert resp.json()["drug_name"] == "Кларитромицин"

    def test_get_foreign_prescription_404(self, other_client, prescription):
        """Other user cannot see this prescription."""
        resp = other_client.get(f"/api/v1/prescriptions/{prescription.id}")
        assert resp.status_code == 404

    def test_get_nonexistent_404(self, app_client):
        resp = app_client.get(f"/api/v1/prescriptions/{uuid.uuid4()}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /prescriptions/{id}
# ---------------------------------------------------------------------------


class TestDeletePrescription:
    @pytest.fixture
    async def prescription(self, db: AsyncSession, test_user: User) -> Prescription:
        today = date.today()
        p = Prescription(
            id=uuid.uuid4(),
            user_id=test_user.id,
            doc_type=DocType.RECIPE_107,
            doctor_name="Сидоров",
            issue_date=today,
            expires_at=today + timedelta(days=60),
            drug_name="Метформин",
            risk_level=RiskLevel.STANDARD,
            status="active",
        )
        db.add(p)
        await db.commit()
        await db.refresh(p)
        return p

    def test_delete_sets_status_deleted(self, app_client, prescription, engine):
        resp = app_client.delete(f"/api/v1/prescriptions/{prescription.id}")
        assert resp.status_code == 204

        # Verify status in DB
        import asyncio

        factory = async_sessionmaker(engine, expire_on_commit=False)

        async def check():
            async with factory() as s:
                r = await s.execute(select(Prescription).where(Prescription.id == prescription.id))
                return r.scalar_one()

        p = asyncio.get_event_loop().run_until_complete(check())
        assert p.status == "deleted"

    def test_deleted_prescription_not_in_list(self, app_client, prescription):
        app_client.delete(f"/api/v1/prescriptions/{prescription.id}")
        resp = app_client.get("/api/v1/prescriptions")
        assert resp.json()["total"] == 0


# ---------------------------------------------------------------------------
# POST /prescriptions/link
# ---------------------------------------------------------------------------


class TestLinkPrescription:
    @pytest.fixture
    async def setup_link(self, db: AsyncSession, test_user: User, other_user: User):
        today = date.today()

        # Prescription owned by test_user
        presc = Prescription(
            id=uuid.uuid4(),
            user_id=test_user.id,
            doc_type=DocType.RECIPE_107,
            doctor_name="Врач",
            issue_date=today,
            expires_at=today + timedelta(days=60),
            drug_name="Аспирин",
            risk_level=RiskLevel.STANDARD,
            status="active",
        )
        db.add(presc)

        # Receipt + ReceiptItem owned by test_user
        receipt = Receipt(
            id=uuid.uuid4(),
            user_id=test_user.id,
            s3_key="receipts/test/link.jpg",
            ocr_status=OCRStatus.DONE,
        )
        db.add(receipt)
        await db.flush()

        item = ReceiptItem(
            id=uuid.uuid4(),
            receipt_id=receipt.id,
            drug_name="Аспирин",
            quantity=1.0,
            unit_price=50.0,
            total_price=50.0,
            is_rx=True,
        )
        db.add(item)

        # Prescription owned by other_user
        other_presc = Prescription(
            id=uuid.uuid4(),
            user_id=other_user.id,
            doc_type=DocType.RECIPE_107,
            doctor_name="Другой врач",
            issue_date=today,
            expires_at=today + timedelta(days=60),
            drug_name="Ибупрофен",
            risk_level=RiskLevel.STANDARD,
            status="active",
        )
        db.add(other_presc)

        await db.commit()
        return presc, item, other_presc

    def test_link_own_prescription_to_own_item(self, app_client, setup_link, engine):
        presc, item, _ = setup_link
        resp = app_client.post(
            "/api/v1/prescriptions/link",
            json={
                "prescription_id": str(presc.id),
                "receipt_item_id": str(item.id),
            },
        )
        assert resp.status_code == 200

        # Verify DB
        import asyncio
        factory = async_sessionmaker(engine, expire_on_commit=False)

        async def check():
            async with factory() as s:
                r = await s.execute(select(ReceiptItem).where(ReceiptItem.id == item.id))
                return r.scalar_one()

        db_item = asyncio.get_event_loop().run_until_complete(check())
        assert db_item.prescription_id == presc.id

    def test_link_other_users_prescription_403(self, app_client, setup_link):
        """Linking another user's prescription → 403."""
        _, item, other_presc = setup_link
        resp = app_client.post(
            "/api/v1/prescriptions/link",
            json={
                "prescription_id": str(other_presc.id),
                "receipt_item_id": str(item.id),
            },
        )
        assert resp.status_code == 403
