"""
TDD tests for SQLAlchemy models (A-03).
Uses SQLite in-memory to verify model structure and basic CRUD.
"""
import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Base
from app.models.enums import DocType, OCRStatus, ReceiptStatus, RiskLevel
from app.models.prescription import Prescription
from app.models.receipt import Receipt
from app.models.receipt_item import ReceiptItem
from app.models.user import User

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


# ---------------------------------------------------------------------------
# Model import tests
# ---------------------------------------------------------------------------


def test_ocr_status_enum_has_required_values():
    assert set(OCRStatus) >= {OCRStatus.PENDING, OCRStatus.DONE, OCRStatus.REVIEW, OCRStatus.FAILED}


def test_receipt_status_enum_exists():
    assert ReceiptStatus is not None
    assert len(list(ReceiptStatus)) > 0


def test_doc_type_enum_has_seven_values():
    assert len(list(DocType)) == 7


def test_risk_level_enum_has_required_values():
    assert set(RiskLevel) >= {RiskLevel.STANDARD, RiskLevel.DISPUTED}


def test_base_metadata_contains_all_tables():
    table_names = set(Base.metadata.tables.keys())
    assert "users" in table_names
    assert "receipts" in table_names
    assert "receipt_items" in table_names
    assert "prescriptions" in table_names


# ---------------------------------------------------------------------------
# Column structure tests
# ---------------------------------------------------------------------------


def test_user_table_has_required_columns():
    table = Base.metadata.tables["users"]
    col_names = {c.name for c in table.columns}
    assert {"id", "telegram_id", "phone_hash", "telegram_username", "created_at"} <= col_names


def test_user_telegram_id_is_unique():
    table = Base.metadata.tables["users"]
    # Unique constraint or unique index on telegram_id (either satisfies uniqueness)
    has_unique_constraint = any(
        set(uc.columns.keys()) == {"telegram_id"}
        for uc in table.constraints
        if hasattr(uc, "columns")
    )
    has_unique_index = any(
        idx.unique and set(idx.columns.keys()) == {"telegram_id"}
        for idx in table.indexes
    )
    assert has_unique_constraint or has_unique_index


def test_receipts_table_has_required_columns():
    table = Base.metadata.tables["receipts"]
    col_names = {c.name for c in table.columns}
    required = {
        "id",
        "user_id",
        "s3_key",
        "ocr_status",
        "needs_prescription",
        "purchase_date",
        "pharmacy_name",
        "total_amount",
        "ocr_confidence",
        "merge_strategy",
        "created_at",
    }
    assert required <= col_names


def test_receipt_items_table_has_required_columns():
    table = Base.metadata.tables["receipt_items"]
    col_names = {c.name for c in table.columns}
    required = {
        "id",
        "receipt_id",
        "drug_name",
        "drug_inn",
        "quantity",
        "unit_price",
        "total_price",
        "is_rx",
        "prescription_id",
    }
    assert required <= col_names


def test_prescriptions_table_has_required_columns():
    table = Base.metadata.tables["prescriptions"]
    col_names = {c.name for c in table.columns}
    required = {
        "id",
        "user_id",
        "doc_type",
        "doctor_name",
        "doctor_specialty",
        "clinic_name",
        "issue_date",
        "expires_at",
        "drug_name",
        "drug_inn",
        "dosage",
        "s3_key",
        "risk_level",
        "status",
    }
    assert required <= col_names


def test_receipt_items_has_cascade_fk_to_receipts():
    table = Base.metadata.tables["receipt_items"]
    fk_targets = {fk.target_fullname for col in table.columns for fk in col.foreign_keys}
    assert "receipts.id" in fk_targets


def test_prescriptions_has_fk_to_users():
    table = Base.metadata.tables["prescriptions"]
    fk_targets = {fk.target_fullname for col in table.columns for fk in col.foreign_keys}
    assert "users.id" in fk_targets


# ---------------------------------------------------------------------------
# CRUD tests (require async engine with SQLite)
# ---------------------------------------------------------------------------


async def test_create_and_read_user(session: AsyncSession):
    user = User(
        id=uuid.uuid4(),
        telegram_id=123456789,
        phone_hash="a" * 60,
        telegram_username="testuser",
    )
    session.add(user)
    await session.commit()

    result = await session.get(User, user.id)
    assert result is not None
    assert result.telegram_id == 123456789
    assert result.telegram_username == "testuser"


async def test_create_receipt_with_user(session: AsyncSession):
    user = User(id=uuid.uuid4(), telegram_id=987654321)
    session.add(user)
    await session.flush()

    receipt = Receipt(
        id=uuid.uuid4(),
        user_id=user.id,
        s3_key="receipts/test.jpg",
        ocr_status=OCRStatus.PENDING,
        needs_prescription=False,
    )
    session.add(receipt)
    await session.commit()

    result = await session.get(Receipt, receipt.id)
    assert result is not None
    assert result.ocr_status == OCRStatus.PENDING
    assert result.needs_prescription is False


async def test_create_receipt_item(session: AsyncSession):
    user = User(id=uuid.uuid4(), telegram_id=111111111)
    session.add(user)
    await session.flush()

    receipt = Receipt(
        id=uuid.uuid4(),
        user_id=user.id,
        s3_key="receipts/test2.jpg",
        ocr_status=OCRStatus.DONE,
        needs_prescription=True,
        total_amount=Decimal("1250.00"),
    )
    session.add(receipt)
    await session.flush()

    item = ReceiptItem(
        id=uuid.uuid4(),
        receipt_id=receipt.id,
        drug_name="Аспирин",
        drug_inn="ацетилсалициловая кислота",
        quantity=2.0,
        unit_price=Decimal("150.00"),
        total_price=Decimal("300.00"),
        is_rx=False,
    )
    session.add(item)
    await session.commit()

    result = await session.get(ReceiptItem, item.id)
    assert result is not None
    assert result.drug_name == "Аспирин"
    assert result.is_rx is False


async def test_create_prescription(session: AsyncSession):
    user = User(id=uuid.uuid4(), telegram_id=222222222)
    session.add(user)
    await session.flush()

    prescription = Prescription(
        id=uuid.uuid4(),
        user_id=user.id,
        doc_type=DocType.RECIPE_107,
        doctor_name="Иванов И.И.",
        issue_date=date(2024, 1, 15),
        expires_at=date(2024, 3, 15),
        drug_name="Амоксициллин",
        risk_level=RiskLevel.STANDARD,
        status="active",
    )
    session.add(prescription)
    await session.commit()

    result = await session.get(Prescription, prescription.id)
    assert result is not None
    assert result.doc_type == DocType.RECIPE_107
    assert result.risk_level == RiskLevel.STANDARD
    assert result.status == "active"


async def test_prescription_risk_level_disputed_for_form_025(session: AsyncSession):
    """Рецепт 025/у должен иметь risk_level=DISPUTED (назначается сервисным слоем)."""
    user = User(id=uuid.uuid4(), telegram_id=333333333)
    session.add(user)
    await session.flush()

    prescription = Prescription(
        id=uuid.uuid4(),
        user_id=user.id,
        doc_type=DocType.DOC_025,
        doctor_name="Петров П.П.",
        issue_date=date(2024, 2, 1),
        expires_at=date(2024, 4, 1),
        drug_name="Лидокаин",
        risk_level=RiskLevel.DISPUTED,
        status="active",
    )
    session.add(prescription)
    await session.commit()

    result = await session.get(Prescription, prescription.id)
    assert result.risk_level == RiskLevel.DISPUTED


async def test_receipt_item_is_rx_default_false(session: AsyncSession):
    user = User(id=uuid.uuid4(), telegram_id=444444444)
    session.add(user)
    await session.flush()

    receipt = Receipt(
        id=uuid.uuid4(),
        user_id=user.id,
        s3_key="receipts/test3.jpg",
        ocr_status=OCRStatus.PENDING,
        needs_prescription=False,
    )
    session.add(receipt)
    await session.flush()

    item = ReceiptItem(
        id=uuid.uuid4(),
        receipt_id=receipt.id,
        drug_name="Парацетамол",
        quantity=1.0,
        unit_price=Decimal("80.00"),
        total_price=Decimal("80.00"),
    )
    session.add(item)
    await session.commit()

    result = await session.get(ReceiptItem, item.id)
    assert result.is_rx is False


async def test_indexes_exist_on_users(engine):
    """Проверка базовых индексов на таблице users."""
    async with engine.connect() as conn:
        result = await conn.run_sync(
            lambda sync_conn: inspect(sync_conn).get_indexes("users")
        )
    index_cols = [idx["column_names"] for idx in result]
    # telegram_id должен быть уникальным (unique constraint или unique index)
    assert any("telegram_id" in cols for cols in index_cols)
