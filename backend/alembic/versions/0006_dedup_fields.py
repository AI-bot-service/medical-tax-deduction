"""0006_dedup_fields: уникальность чеков и рецептов

Добавляет поля для дедупликации:
  receipts:
    - fiscal_fn   VARCHAR(20) — номер фискального накопителя (ФН)
    - fiscal_fd   VARCHAR(20) — номер фискального документа (ФД)
    - fiscal_fp   VARCHAR(20) — фискальный признак
    - duplicate_of_id UUID FK(receipts.id) — ссылка на существующий дубль
  prescriptions:
    - duplicate_of_id UUID FK(prescriptions.id) — ссылка на существующий дубль

Индексы:
  ix_receipts_fiscal (fiscal_fn, fiscal_fd) — быстрый поиск по QR-данным

Revision ID: 0006
Revises: 0005
Create Date: 2026-03-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── receipts: фискальные поля ─────────────────────────────────────────────
    op.add_column("receipts", sa.Column("fiscal_fn", sa.String(20), nullable=True))
    op.add_column("receipts", sa.Column("fiscal_fd", sa.String(20), nullable=True))
    op.add_column("receipts", sa.Column("fiscal_fp", sa.String(20), nullable=True))
    op.add_column(
        "receipts",
        sa.Column(
            "duplicate_of_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("receipts.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_receipts_fiscal", "receipts", ["fiscal_fn", "fiscal_fd"])

    # ── prescriptions: ссылка на дубль ────────────────────────────────────────
    op.add_column(
        "prescriptions",
        sa.Column(
            "duplicate_of_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("prescriptions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # ── RLS: дать воркеру доступ к новым колонкам (уже включено через GRANT на таблицы) ──
    # Явных действий не требуется — GRANT выдан на всю таблицу в 0005.


def downgrade() -> None:
    op.drop_column("prescriptions", "duplicate_of_id")

    op.drop_index("ix_receipts_fiscal", table_name="receipts")
    op.drop_column("receipts", "duplicate_of_id")
    op.drop_column("receipts", "fiscal_fp")
    op.drop_column("receipts", "fiscal_fd")
    op.drop_column("receipts", "fiscal_fn")
