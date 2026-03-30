"""Сервис дедупликации чеков.

Уникальность чека определяется исключительно по паре fiscal_fn + fiscal_fd
(глобально уникальный номер российского фискального чека из QR-кода).

Чеки без QR-данных всегда сохраняются (UNIQUE).

Результаты:
  - UNIQUE:    нет дубля по fn+fd → сохранять
  - IDENTICAL: fn+fd уже есть в БД → пропустить
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from enum import Enum

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.receipt import Receipt
from app.services.ocr.pipeline import ParsedReceipt

logger = logging.getLogger(__name__)


class DuplicateKind(str, Enum):
    UNIQUE = "unique"
    IDENTICAL = "identical"
    CONFLICT = "conflict"  # оставляем для совместимости, больше не используется


@dataclass
class ReceiptDuplicateResult:
    kind: DuplicateKind
    existing_id: uuid.UUID | None = None


async def check_receipt_duplicate(
    db: AsyncSession,
    user_id: uuid.UUID,
    parsed: ParsedReceipt,
) -> ReceiptDuplicateResult:
    """Проверить дубль по fn+fd. Без QR-данных всегда UNIQUE."""
    if not parsed.fiscal_fn or not parsed.fiscal_fd:
        return ReceiptDuplicateResult(kind=DuplicateKind.UNIQUE)

    result = await db.execute(
        select(Receipt.id)
        .where(
            and_(
                Receipt.fiscal_fn == parsed.fiscal_fn,
                Receipt.fiscal_fd == parsed.fiscal_fd,
            )
        )
        .limit(1)
    )
    existing_id = result.scalar_one_or_none()

    if existing_id is None:
        return ReceiptDuplicateResult(kind=DuplicateKind.UNIQUE)

    logger.info(
        "receipt dedup: IDENTICAL fn=%s fd=%s -> existing=%s",
        parsed.fiscal_fn, parsed.fiscal_fd, existing_id,
    )
    return ReceiptDuplicateResult(kind=DuplicateKind.IDENTICAL, existing_id=existing_id)
