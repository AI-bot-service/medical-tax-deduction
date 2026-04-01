"""0009_duplicate_review_status: добавить DUPLICATE_REVIEW в enum ocrstatus

Новый статус используется для чеков, у которых обнаружен дубликат.
Вместо молчаливого удаления файл сохраняется для проверки пользователем.

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-01
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Postgres позволяет добавлять значения в enum, но не удалять
    op.execute("ALTER TYPE ocrstatus ADD VALUE IF NOT EXISTS 'DUPLICATE_REVIEW'")


def downgrade() -> None:
    # Удаление значения из enum в Postgres не поддерживается без пересоздания типа
    pass
