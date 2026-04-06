"""0010_deduction_engine: таблицы для движка расчёта социального налогового вычета

Добавляет:
- enum expensecategory (8 категорий расходов)
- enum familyrole (spouse/child)
- таблица family_members (члены семьи)
- таблица expenses (все расходы пользователя)
- таблица income_records (годовой доход)

Revision ID: 0010
Revises: 0009
Create Date: 2026-04-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- family_members (создаём первым — на него ссылается expenses) ---
    op.create_table(
        "family_members",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.Uuid(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("role", sa.Enum("spouse", "child", name="familyrole"), nullable=False),
        sa.Column("full_name", sa.String(512), nullable=True),
        sa.Column("birth_year", sa.Integer, nullable=True),
        sa.Column("linked_user_id", sa.Uuid(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_family_members_user_id", "family_members", ["user_id"])

    # --- expenses ---
    op.create_table(
        "expenses",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.Uuid(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("category", sa.Enum("medicine", "treatment_regular", "treatment_expensive", "vhi", "education_self", "education_child", "education_spouse", "fitness", name="expensecategory"), nullable=False),
        sa.Column("tax_year", sa.Integer, nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("child_id", sa.Uuid(as_uuid=True),
                  sa.ForeignKey("family_members.id", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("receipt_id", sa.Uuid(as_uuid=True),
                  sa.ForeignKey("receipts.id", ondelete="SET NULL"),
                  nullable=True),
        sa.Column("document_s3_key", sa.String, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_expenses_user_year", "expenses", ["user_id", "tax_year"])

    # --- income_records ---
    op.create_table(
        "income_records",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.Uuid(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("tax_year", sa.Integer, nullable=False),
        sa.Column("annual_income", sa.Numeric(14, 2), nullable=False),
        sa.Column("tax_paid", sa.Numeric(12, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_income_records_user_id", "income_records", ["user_id"])
    op.create_unique_constraint(
        "uq_income_user_year", "income_records", ["user_id", "tax_year"]
    )

    # --- Миграция существующих чеков в expenses ---
    # Все чеки со статусом DONE/REVIEW автоматически становятся записями в expenses
    # с категорией 'medicine' (лекарства — единственный тип в MedВычет)
    op.execute("""
        INSERT INTO expenses (id, user_id, category, tax_year, amount, receipt_id, created_at)
        SELECT
            gen_random_uuid(),
            r.user_id,
            'medicine'::expensecategory,
            EXTRACT(YEAR FROM r.created_at)::integer,
            r.total_amount,
            r.id,
            r.created_at
        FROM receipts r
        WHERE r.ocr_status IN ('DONE', 'REVIEW')
          AND r.total_amount IS NOT NULL
    """)


def downgrade() -> None:
    op.drop_table("income_records")
    op.drop_table("expenses")
    op.drop_table("family_members")
    op.execute("DROP TYPE IF EXISTS expensecategory")
    op.execute("DROP TYPE IF EXISTS familyrole")
