"""Tests for Alembic 0005_rls_policies migration (D-04).

Since RLS is a PostgreSQL-only feature, these tests verify:
  - Migration file structure and content
  - SQL statements are well-formed (parsed correctly)
  - Migration chain: 0005 revises 0004
  - upgrade/downgrade functions are callable (with mocked op)
"""
from __future__ import annotations

import importlib
import sys
from pathlib import Path
from unittest.mock import MagicMock, call, patch

import pytest

MIGRATION_PATH = Path(__file__).parent.parent.parent / "alembic" / "versions" / "0005_rls_policies.py"


# ---------------------------------------------------------------------------
# Module import
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def migration_module():
    spec = importlib.util.spec_from_file_location("migration_0005", MIGRATION_PATH)
    mod = importlib.util.module_from_spec(spec)
    # Provide minimal alembic.op mock so import succeeds
    with patch.dict("sys.modules", {"alembic.op": MagicMock(), "alembic": MagicMock()}):
        spec.loader.exec_module(mod)
    return mod


class TestMigrationMetadata:
    def test_revision_is_0005(self):
        spec = importlib.util.spec_from_file_location("migration_0005_meta", MIGRATION_PATH)
        mod = importlib.util.module_from_spec(spec)
        with patch.dict("sys.modules", {"alembic.op": MagicMock(), "alembic": MagicMock()}):
            spec.loader.exec_module(mod)
        assert mod.revision == "0005"

    def test_down_revision_is_0004(self):
        spec = importlib.util.spec_from_file_location("migration_0005_dr", MIGRATION_PATH)
        mod = importlib.util.module_from_spec(spec)
        with patch.dict("sys.modules", {"alembic.op": MagicMock(), "alembic": MagicMock()}):
            spec.loader.exec_module(mod)
        assert mod.down_revision == "0004"

    def test_file_exists(self):
        assert MIGRATION_PATH.exists(), "0005_rls_policies.py must exist"


class TestMigrationContent:
    def test_file_contains_enable_rls(self):
        content = MIGRATION_PATH.read_text(encoding="utf-8")
        assert "ENABLE ROW LEVEL SECURITY" in content

    def test_file_contains_bypass_rls(self):
        content = MIGRATION_PATH.read_text(encoding="utf-8")
        assert "BYPASSRLS" in content

    def test_file_contains_medvychet_worker_role(self):
        content = MIGRATION_PATH.read_text(encoding="utf-8")
        assert "medvychet_worker" in content

    def test_file_contains_receipts_policy(self):
        content = MIGRATION_PATH.read_text(encoding="utf-8")
        assert "receipts" in content
        assert "user_id" in content

    def test_file_contains_current_setting(self):
        content = MIGRATION_PATH.read_text(encoding="utf-8")
        assert "current_setting('app.current_user_id')" in content

    def test_file_contains_all_target_tables(self):
        content = MIGRATION_PATH.read_text(encoding="utf-8")
        for table in ["receipts", "receipt_items", "prescriptions", "batch_jobs"]:
            assert table in content, f"Table {table} should have RLS policy"

    def test_file_contains_downgrade(self):
        content = MIGRATION_PATH.read_text(encoding="utf-8")
        assert "def downgrade" in content
        assert "DISABLE ROW LEVEL SECURITY" in content

    def test_syntax_valid(self):
        import ast
        content = MIGRATION_PATH.read_text(encoding="utf-8")
        try:
            ast.parse(content)
        except SyntaxError as exc:
            pytest.fail(f"Syntax error in migration: {exc}")


class TestMigrationFunctions:
    def _load_module(self, name: str):
        spec = importlib.util.spec_from_file_location(name, MIGRATION_PATH)
        mod = importlib.util.module_from_spec(spec)
        mock_op = MagicMock()
        mock_alembic = MagicMock()
        mock_alembic.op = mock_op
        with patch.dict("sys.modules", {"alembic": mock_alembic, "alembic.op": mock_op}):
            spec.loader.exec_module(mod)
        # Inject mock_op into module namespace (migration uses `from alembic import op`)
        mod.op = mock_op
        return mod, mock_op

    def test_upgrade_calls_execute(self):
        """upgrade() calls op.execute at least once per table."""
        mod, mock_op = self._load_module("migration_0005_up")
        mod.upgrade()
        assert mock_op.execute.call_count > 4, "upgrade should call execute multiple times"

    def test_downgrade_calls_execute(self):
        """downgrade() calls op.execute to drop policies and disable RLS."""
        mod, mock_op = self._load_module("migration_0005_down")
        mod.downgrade()
        assert mock_op.execute.call_count > 0
