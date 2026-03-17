"""0001_initial: users, receipts, receipt_items, prescriptions

Revision ID: 0001
Revises:
Create Date: 2026-03-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# ENUM definitions
ocrstatus_enum = postgresql.ENUM(
    "PENDING", "DONE", "REVIEW", "FAILED",
    name="ocrstatus",
    create_type=False,
)
doctype_enum = postgresql.ENUM(
    "recipe_107", "recipe_egisz", "doc_025", "doc_003", "doc_043", "doc_111", "doc_025_1",
    name="doctype",
    create_type=False,
)
risklevel_enum = postgresql.ENUM(
    "STANDARD", "DISPUTED", "HIGH",
    name="risklevel",
    create_type=False,
)


def upgrade() -> None:
    # Create ENUM types
    op.execute("CREATE TYPE ocrstatus AS ENUM ('PENDING', 'DONE', 'REVIEW', 'FAILED')")
    op.execute(
        "CREATE TYPE doctype AS ENUM "
        "('recipe_107', 'recipe_egisz', 'doc_025', 'doc_003', 'doc_043', 'doc_111', 'doc_025_1')"
    )
    op.execute("CREATE TYPE risklevel AS ENUM ('STANDARD', 'DISPUTED', 'HIGH')")

    # users
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("phone_hash", sa.String(72), nullable=True),
        sa.Column("telegram_username", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_users_telegram_id", "users", ["telegram_id"], unique=True)

    # prescriptions (created before receipts so receipt_items FK can reference it)
    op.create_table(
        "prescriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("doc_type", doctype_enum, nullable=False),
        sa.Column("doctor_name", sa.String(), nullable=False),
        sa.Column("doctor_specialty", sa.String(), nullable=True),
        sa.Column("clinic_name", sa.String(), nullable=True),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("expires_at", sa.Date(), nullable=False),
        sa.Column("drug_name", sa.String(), nullable=False),
        sa.Column("drug_inn", sa.String(), nullable=True),
        sa.Column("dosage", sa.String(), nullable=True),
        sa.Column("s3_key", sa.String(), nullable=True),
        sa.Column("risk_level", risklevel_enum, server_default="STANDARD", nullable=False),
        sa.Column("status", sa.String(), server_default="active", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_prescriptions_user_id", "prescriptions", ["user_id"])
    op.create_index("ix_prescriptions_drug_inn", "prescriptions", ["drug_inn"])

    # receipts
    op.create_table(
        "receipts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("s3_key", sa.String(), nullable=False),
        sa.Column("ocr_status", ocrstatus_enum, server_default="PENDING", nullable=False),
        sa.Column("needs_prescription", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("purchase_date", sa.Date(), nullable=True),
        sa.Column("pharmacy_name", sa.String(), nullable=True),
        sa.Column("total_amount", sa.Numeric(10, 2), nullable=True),
        sa.Column("ocr_confidence", sa.Float(), nullable=True),
        sa.Column("merge_strategy", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_receipts_user_id", "receipts", ["user_id"])
    op.create_index("ix_receipts_purchase_date", "receipts", ["user_id", "purchase_date"])

    # receipt_items
    op.create_table(
        "receipt_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("receipt_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("drug_name", sa.String(), nullable=False),
        sa.Column("drug_inn", sa.String(), nullable=True),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("unit_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("total_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("is_rx", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("prescription_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["receipt_id"], ["receipts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["prescription_id"], ["prescriptions.id"], ondelete="SET NULL"
        ),
    )
    op.create_index("ix_receipt_items_receipt_id", "receipt_items", ["receipt_id"])
    op.create_index("ix_receipt_items_drug_inn", "receipt_items", ["drug_inn", "is_rx"])


def downgrade() -> None:
    op.drop_table("receipt_items")
    op.drop_table("receipts")
    op.drop_table("prescriptions")
    op.drop_index("ix_users_telegram_id", "users")
    op.drop_table("users")

    op.execute("DROP TYPE IF EXISTS ocrstatus")
    op.execute("DROP TYPE IF EXISTS doctype")
    op.execute("DROP TYPE IF EXISTS risklevel")
