"""0012_receipt_prescription_id: добавить prescription_id в receipts

Связывает чек напрямую с рецептом (один рецепт → много чеков).

Revision ID: 0012
Revises: 0011
Create Date: 2026-04-10
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "receipts",
        sa.Column(
            "prescription_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("prescriptions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_receipts_prescription_id", "receipts", ["prescription_id"])


def downgrade() -> None:
    op.drop_index("ix_receipts_prescription_id", "receipts")
    op.drop_column("receipts", "prescription_id")
