"""prescription_items: выделить препараты рецепта в отдельную таблицу.

Revision ID: 0008
Revises: 0007
Create Date: 2026-03-31
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007_fiscal_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Создать таблицу prescription_items ───────────────────────────────
    op.create_table(
        "prescription_items",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            "prescription_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("prescriptions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("drug_name", sa.String(), nullable=False),
        sa.Column("drug_inn", sa.String(), nullable=True),
        sa.Column("dosage", sa.String(), nullable=True),
        sa.Column("is_rx", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_prescription_items_prescription_id",
        "prescription_items",
        ["prescription_id"],
    )
    op.create_index(
        "ix_prescription_items_drug_inn",
        "prescription_items",
        ["drug_inn"],
        postgresql_where=sa.text("drug_inn IS NOT NULL"),
    )

    # ── 2. RLS ───────────────────────────────────────────────────────────────
    op.execute("ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE prescription_items FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY prescription_items_user_select ON prescription_items
        FOR SELECT
        USING (
            prescription_id IN (
                SELECT id FROM prescriptions
                WHERE user_id = current_setting('app.current_user_id')::uuid
            )
        )
    """)
    op.execute("""
        CREATE POLICY prescription_items_user_insert ON prescription_items
        FOR INSERT
        WITH CHECK (
            prescription_id IN (
                SELECT id FROM prescriptions
                WHERE user_id = current_setting('app.current_user_id')::uuid
            )
        )
    """)
    op.execute("""
        CREATE POLICY prescription_items_user_update ON prescription_items
        FOR UPDATE
        USING (
            prescription_id IN (
                SELECT id FROM prescriptions
                WHERE user_id = current_setting('app.current_user_id')::uuid
            )
        )
    """)
    op.execute("""
        CREATE POLICY prescription_items_user_delete ON prescription_items
        FOR DELETE
        USING (
            prescription_id IN (
                SELECT id FROM prescriptions
                WHERE user_id = current_setting('app.current_user_id')::uuid
            )
        )
    """)
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON prescription_items TO medvychet_worker"
    )

    # ── 3. Миграция данных ───────────────────────────────────────────────────
    # Для каждой группы (user_id, issue_date, doctor_name, s3_key, batch_id)
    # оставляем одну «каноническую» строку (min created_at).
    # Остальные строки группы становятся items.

    # 3a. Найти canonical_id для каждой строки
    op.execute("""
        CREATE TEMP TABLE _presc_canonical AS
        SELECT
            p.id,
            FIRST_VALUE(p.id) OVER (
                PARTITION BY
                    p.user_id,
                    p.issue_date,
                    p.doctor_name,
                    COALESCE(p.s3_key, ''),
                    COALESCE(p.batch_id::text, '')
                ORDER BY p.created_at
            ) AS canonical_id
        FROM prescriptions p
    """)

    # 3b. Вставить все препараты в prescription_items (каждая старая строка → 1 item)
    op.execute("""
        INSERT INTO prescription_items (id, prescription_id, drug_name, drug_inn, dosage, is_rx, created_at)
        SELECT
            p.id,
            c.canonical_id,
            p.drug_name,
            p.drug_inn,
            p.dosage,
            TRUE,
            p.created_at
        FROM prescriptions p
        JOIN _presc_canonical c ON c.id = p.id
    """)

    # 3c. Перенаправить receipt_items.prescription_id на canonical_id
    op.execute("""
        UPDATE receipt_items ri
        SET prescription_id = c.canonical_id
        FROM _presc_canonical c
        WHERE ri.prescription_id = c.id
          AND c.id <> c.canonical_id
    """)

    # 3d. Удалить неканонические строки из prescriptions
    op.execute("""
        DELETE FROM prescriptions p
        USING _presc_canonical c
        WHERE p.id = c.id
          AND c.id <> c.canonical_id
    """)

    op.execute("DROP TABLE _presc_canonical")

    # ── 4. Удалить drug-колонки из prescriptions ─────────────────────────────
    op.drop_index("ix_prescriptions_search", table_name="prescriptions")
    op.drop_column("prescriptions", "drug_name")
    op.drop_column("prescriptions", "drug_inn")
    op.drop_column("prescriptions", "dosage")

    # ── 5. Новый индекс на prescriptions ─────────────────────────────────────
    op.create_index(
        "ix_prescriptions_user_date",
        "prescriptions",
        ["user_id", "issue_date", "expires_at"],
    )


def downgrade() -> None:
    # Lossy: восстанавливаем колонки из первого item каждого рецепта.
    # Для многопрепаратных рецептов данные теряются — это документировано.
    op.drop_index("ix_prescriptions_user_date", table_name="prescriptions")

    op.add_column("prescriptions", sa.Column("drug_name", sa.String(), nullable=True))
    op.add_column("prescriptions", sa.Column("drug_inn", sa.String(), nullable=True))
    op.add_column("prescriptions", sa.Column("dosage", sa.String(), nullable=True))

    # Заполнить из первого item
    op.execute("""
        UPDATE prescriptions p
        SET
            drug_name = sub.drug_name,
            drug_inn  = sub.drug_inn,
            dosage    = sub.dosage
        FROM (
            SELECT DISTINCT ON (prescription_id)
                prescription_id,
                drug_name,
                drug_inn,
                dosage
            FROM prescription_items
            ORDER BY prescription_id, created_at
        ) sub
        WHERE p.id = sub.prescription_id
    """)

    # Сделать drug_name NOT NULL (поставить заглушку где NULL)
    op.execute("UPDATE prescriptions SET drug_name = 'Неизвестно' WHERE drug_name IS NULL")
    op.alter_column("prescriptions", "drug_name", nullable=False)

    op.create_index(
        "ix_prescriptions_search",
        "prescriptions",
        ["user_id", "drug_inn", "issue_date", "expires_at"],
    )

    op.drop_index("ix_prescription_items_drug_inn", table_name="prescription_items")
    op.drop_index("ix_prescription_items_prescription_id", table_name="prescription_items")
    op.drop_table("prescription_items")
