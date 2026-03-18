"""0005_rls_policies: ENABLE ROW LEVEL SECURITY + policies + worker role

Enables RLS on all user-owned tables:
  receipts, receipt_items, prescriptions, batch_jobs

Creates policies using:
  USING (user_id = current_setting('app.current_user_id')::uuid)

Creates role medvychet_worker with BYPASS ROW LEVEL SECURITY for Celery workers.

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-18
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Tables that get RLS enabled + a user_id-based policy
_RLS_TABLES = [
    "receipts",
    "receipt_items",
    "prescriptions",
    "batch_jobs",
]

# receipt_items joins through receipts, so policy needs a subquery
_SUBQUERY_TABLES = {
    "receipt_items": (
        "receipt_id IN (SELECT id FROM receipts "
        "WHERE user_id = current_setting('app.current_user_id')::uuid)"
    ),
}


def upgrade() -> None:
    # ── 1. Create the worker role (if it doesn't exist) ──────────────────────
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medvychet_worker') THEN
                CREATE ROLE medvychet_worker WITH LOGIN BYPASSRLS;
            END IF;
        END;
        $$;
    """)

    # ── 2. Enable RLS + create SELECT/INSERT/UPDATE/DELETE policies ──────────
    for table in _RLS_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

        if table in _SUBQUERY_TABLES:
            using_clause = _SUBQUERY_TABLES[table]
        else:
            using_clause = (
                "user_id = current_setting('app.current_user_id')::uuid"
            )

        # SELECT policy
        op.execute(f"""
            CREATE POLICY {table}_select ON {table}
                FOR SELECT
                USING ({using_clause})
        """)

        # INSERT policy (same check for tables with user_id)
        if table not in _SUBQUERY_TABLES:
            op.execute(f"""
                CREATE POLICY {table}_insert ON {table}
                    FOR INSERT
                    WITH CHECK (user_id = current_setting('app.current_user_id')::uuid)
            """)

        # UPDATE policy
        op.execute(f"""
            CREATE POLICY {table}_update ON {table}
                FOR UPDATE
                USING ({using_clause})
        """)

        # DELETE policy
        op.execute(f"""
            CREATE POLICY {table}_delete ON {table}
                FOR DELETE
                USING ({using_clause})
        """)

    # ── 3. Grant table access to the worker role ─────────────────────────────
    for table in _RLS_TABLES:
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE {table} TO medvychet_worker")


def downgrade() -> None:
    # Drop policies in reverse order
    for table in reversed(_RLS_TABLES):
        for action in ("delete", "update", "insert", "select"):
            op.execute(
                f"DROP POLICY IF EXISTS {table}_{action} ON {table}"
            )
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    op.execute("DROP ROLE IF EXISTS medvychet_worker")
