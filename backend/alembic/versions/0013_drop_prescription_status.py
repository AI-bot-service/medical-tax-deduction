"""0013_drop_prescription_status: удалить колонку status из prescriptions

Переход с soft-delete на hard-delete: удаление блокируется если есть
привязанные чеки (receipt_items.prescription_id), иначе — физическое удаление.

Revision ID: 0013
Revises: 0012
Create Date: 2026-04-16
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("prescriptions", "status")


def downgrade() -> None:
    op.add_column(
        "prescriptions",
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
    )
