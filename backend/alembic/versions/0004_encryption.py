"""0004_encryption: add encrypted PD columns to users table

Adds full_name, inn, snils as VARCHAR(512) columns to users.
These columns store Fernet-encrypted values (AES-128-CBC + HMAC-SHA256).

Also adds export_jobs table for H-01 export tracking.

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── Encrypted PD columns in users ─────────────────────────────────────────
    # Existing rows get NULL (no plaintext to encrypt retroactively)
    op.add_column("users", sa.Column("full_name", sa.String(512), nullable=True))
    op.add_column("users", sa.Column("inn", sa.String(512), nullable=True))
    op.add_column("users", sa.Column("snils", sa.String(512), nullable=True))

    # ── export_jobs table (H-01) ───────────────────────────────────────────────
    op.create_table(
        "export_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("s3_key", sa.String(), nullable=True),
        sa.Column("error", sa.String(), nullable=True),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_export_jobs_user_id", "export_jobs", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_export_jobs_user_id", table_name="export_jobs")
    op.drop_table("export_jobs")

    op.drop_column("users", "snils")
    op.drop_column("users", "inn")
    op.drop_column("users", "full_name")
