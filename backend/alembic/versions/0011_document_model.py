"""0011_document_model: модель Document для справок, договоров и 2-НДФЛ

Добавляет:
- enum documenttype (clinic_cert, vhi_cert, ndfl_2, contract)
- enum documentstatus (uploaded, pending, confirmed)
- таблица documents

Revision ID: 0011
Revises: 0010
Create Date: 2026-04-03
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "documents",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("doc_type", sa.Enum("clinic_cert", "vhi_cert", "ndfl_2", "contract", name="documenttype"), nullable=False),
        sa.Column(
            "doc_status",
            sa.Enum("uploaded", "pending", "confirmed", name="documentstatus"),
            nullable=False,
            server_default="uploaded",
        ),
        sa.Column("tax_year", sa.Integer, nullable=False),
        sa.Column("s3_key", sa.String, nullable=False),
        sa.Column("filename", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_documents_user_id", "documents", ["user_id"])
    op.create_index("ix_documents_user_year", "documents", ["user_id", "tax_year"])


def downgrade() -> None:
    op.drop_index("ix_documents_user_year", "documents")
    op.drop_index("ix_documents_user_id", "documents")
    op.drop_table("documents")
    op.execute("DROP TYPE IF EXISTS documentstatus")
    op.execute("DROP TYPE IF EXISTS documenttype")
