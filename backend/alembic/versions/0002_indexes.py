"""0002_indexes: performance indexes for L1-L4 prescription search

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-18
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # L1/L2: поиск рецептов по INN + период действия
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_prescriptions_search "
        "ON prescriptions (user_id, drug_inn, issue_date, expires_at)"
    )

    # L3: fuzzy поиск по drug_name (GIN trigram index)
    # Требует расширения pg_trgm — создаём если не существует
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_prescriptions_drug_name_gin "
        "ON prescriptions USING GIN (drug_name gin_trgm_ops)"
    )

    # Фильтр рецептов с needs_prescription = true (частичный индекс)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_receipts_needs_prescription "
        "ON receipts (user_id, needs_prescription) "
        "WHERE needs_prescription = true"
    )

    # Поиск по дате покупки чека
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_receipts_purchase_date "
        "ON receipts (user_id, purchase_date DESC)"
    )

    # Items: фильтр по drug_inn и is_rx
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_receipt_items_drug "
        "ON receipt_items (drug_inn, is_rx)"
    )

    # Дополнительные индексы для production-запросов
    # Receipts: фильтр по статусу и дате создания
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_receipts_user_status "
        "ON receipts (user_id, ocr_status, created_at)"
    )

    # Prescriptions: фильтр по статусу (active/expired)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_prescriptions_user_status "
        "ON prescriptions (user_id, status)"
    )


def downgrade() -> None:
    op.drop_index("ix_prescriptions_user_status", table_name="prescriptions")
    op.drop_index("ix_receipts_user_status", table_name="receipts")
    op.drop_index("ix_receipt_items_drug", table_name="receipt_items")
    op.drop_index("ix_receipts_purchase_date", table_name="receipts")
    op.execute("DROP INDEX IF EXISTS ix_receipts_needs_prescription")
    op.execute("DROP INDEX IF EXISTS ix_prescriptions_drug_name_gin")
    op.drop_index("ix_prescriptions_search", table_name="prescriptions")
