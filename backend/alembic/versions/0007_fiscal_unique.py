"""receipts: заменить индекс ix_receipts_fiscal на уникальное ограничение uq_receipts_fiscal

Revision ID: 0007_fiscal_unique
Revises: 0006_dedup_fields
Create Date: 2026-03-30
"""
from alembic import op

revision = "0007_fiscal_unique"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Удаляем старый обычный индекс
    op.drop_index("ix_receipts_fiscal", table_name="receipts", if_exists=True)
    # Создаём уникальное ограничение (NULL-значения не нарушают его в PostgreSQL)
    op.create_unique_constraint("uq_receipts_fiscal", "receipts", ["fiscal_fn", "fiscal_fd"])


def downgrade() -> None:
    op.drop_constraint("uq_receipts_fiscal", "receipts", type_="unique")
    op.create_index("ix_receipts_fiscal", "receipts", ["fiscal_fn", "fiscal_fd"])
