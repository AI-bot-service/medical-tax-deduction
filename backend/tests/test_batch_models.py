"""
TDD tests for BatchJob model and batch_id columns (A-06).
Uses SQLite in-memory database.
"""
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Base
from app.models.enums import BatchSource, BatchStatus

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
# Enum tests
# ---------------------------------------------------------------------------


def test_batch_status_enum_has_required_values():
    assert "processing" in [v.value for v in BatchStatus]
    assert "completed" in [v.value for v in BatchStatus]
    assert "partial" in [v.value for v in BatchStatus]


def test_batch_source_enum_has_required_values():
    assert "telegram_bot" in [v.value for v in BatchSource]
    assert "web" in [v.value for v in BatchSource]
    assert "mini_app" in [v.value for v in BatchSource]


# ---------------------------------------------------------------------------
# BatchJob model structure tests
# ---------------------------------------------------------------------------


def test_batch_job_model_exists():
    from app.models.batch_job import BatchJob
    assert BatchJob.__tablename__ == "batch_jobs"


def test_batch_job_has_required_columns():
    from app.models.batch_job import BatchJob

    table = BatchJob.__table__
    col_names = {c.name for c in table.columns}
    required = {"id", "user_id", "status", "total_files",
                "done_count", "review_count", "failed_count",
                "source", "completed_at", "created_at"}
    assert required.issubset(col_names)


def test_batch_job_counts_default_to_zero():
    from app.models.batch_job import BatchJob

    table = BatchJob.__table__
    for col_name in ("done_count", "review_count", "failed_count"):
        col = table.c[col_name]
        assert col.default is not None or col.server_default is not None


# ---------------------------------------------------------------------------
# Receipt and Prescription batch_id column tests
# ---------------------------------------------------------------------------


def test_receipt_has_batch_id_column():
    from app.models.receipt import Receipt

    col_names = {c.name for c in Receipt.__table__.columns}
    assert "batch_id" in col_names


def test_prescription_has_batch_id_column():
    from app.models.prescription import Prescription

    col_names = {c.name for c in Prescription.__table__.columns}
    assert "batch_id" in col_names


def test_receipt_batch_id_is_nullable():
    from app.models.receipt import Receipt

    col = Receipt.__table__.c["batch_id"]
    assert col.nullable is True


def test_prescription_batch_id_is_nullable():
    from app.models.prescription import Prescription

    col = Prescription.__table__.c["batch_id"]
    assert col.nullable is True


# ---------------------------------------------------------------------------
# CRUD test
# ---------------------------------------------------------------------------


async def test_batch_job_crud(session):
    """Can create and retrieve a BatchJob in SQLite."""
    from app.models.batch_job import BatchJob

    user_id = uuid.uuid4()
    job = BatchJob(
        id=uuid.uuid4(),
        user_id=user_id,
        status=BatchStatus.PROCESSING,
        total_files=3,
        source=BatchSource.TELEGRAM_BOT,
    )
    session.add(job)
    await session.commit()

    from sqlalchemy import select

    result = await session.execute(select(BatchJob).where(BatchJob.user_id == user_id))
    fetched = result.scalar_one()
    assert fetched.total_files == 3
    assert fetched.done_count == 0
    assert fetched.status == BatchStatus.PROCESSING


async def test_batch_job_completed_at_is_nullable(session):
    """completed_at can be None (batch still processing)."""
    from app.models.batch_job import BatchJob

    job = BatchJob(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        status=BatchStatus.PROCESSING,
        total_files=1,
        source=BatchSource.WEB,
    )
    session.add(job)
    await session.commit()

    from sqlalchemy import select

    result = await session.execute(select(BatchJob).where(BatchJob.id == job.id))
    fetched = result.scalar_one()
    assert fetched.completed_at is None
