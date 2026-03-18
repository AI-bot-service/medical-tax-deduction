"""0003_otp_batch: otp_codes, batch_jobs tables; batch_id FK in receipts/prescriptions

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── ENUM types ────────────────────────────────────────────────────────────
    batchstatus = postgresql.ENUM(
        "processing", "completed", "partial",
        name="batchstatus",
        create_type=True,
    )
    batchstatus.create(op.get_bind(), checkfirst=True)

    batchsource = postgresql.ENUM(
        "telegram_bot", "web", "mini_app",
        name="batchsource",
        create_type=True,
    )
    batchsource.create(op.get_bind(), checkfirst=True)

    # ── otp_codes ─────────────────────────────────────────────────────────────
    op.create_table(
        "otp_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("phone_hash", sa.String(72), nullable=False),
        sa.Column("code_hash", sa.String(72), nullable=False),
        sa.Column(
            "expires_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
        ),
        sa.Column("attempts", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("used", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_otp_codes_phone_hash", "otp_codes", ["phone_hash"])
    op.create_index("ix_otp_codes_expires_at", "otp_codes", ["expires_at"])

    # ── batch_jobs ────────────────────────────────────────────────────────────
    op.create_table(
        "batch_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status",
            postgresql.ENUM("processing", "completed", "partial", name="batchstatus", create_type=False),
            nullable=False,
            server_default="processing",
        ),
        sa.Column("total_files", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("done_count", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("review_count", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("failed_count", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column(
            "source",
            postgresql.ENUM("telegram_bot", "web", "mini_app", name="batchsource", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "completed_at",
            sa.TIMESTAMP(timezone=True),
            nullable=True,
        ),
    )
    op.create_index("ix_batch_jobs_user_id", "batch_jobs", ["user_id"])

    # ── Add batch_id FK to receipts ───────────────────────────────────────────
    op.add_column(
        "receipts",
        sa.Column(
            "batch_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("batch_jobs.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_receipts_batch_id", "receipts", ["batch_id"])

    # ── Add batch_id FK to prescriptions ──────────────────────────────────────
    op.add_column(
        "prescriptions",
        sa.Column(
            "batch_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("batch_jobs.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_prescriptions_batch_id", "prescriptions", ["batch_id"])


def downgrade() -> None:
    op.drop_index("ix_prescriptions_batch_id", table_name="prescriptions")
    op.drop_column("prescriptions", "batch_id")

    op.drop_index("ix_receipts_batch_id", table_name="receipts")
    op.drop_column("receipts", "batch_id")

    op.drop_index("ix_batch_jobs_user_id", table_name="batch_jobs")
    op.drop_table("batch_jobs")

    op.drop_index("ix_otp_codes_expires_at", table_name="otp_codes")
    op.drop_index("ix_otp_codes_phone_hash", table_name="otp_codes")
    op.drop_table("otp_codes")

    sa.Enum(name="batchsource").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="batchstatus").drop(op.get_bind(), checkfirst=True)
