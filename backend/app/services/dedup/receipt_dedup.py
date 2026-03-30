"""Сервис дедупликации чеков.

Уникальность чека определяется по приоритету:
  1. fiscal_fn + fiscal_fd — глобально уникальная пара для российских фискальных чеков
  2. (user_id, purchase_date, total_amount) — фолбэк для чеков без QR-кода

Результаты проверки:
  - UNIQUE: дублей нет, сохранять в БД
  - IDENTICAL: точный дубль (тот же состав), пропустить без сохранения
  - CONFLICT: чек с теми же реквизитами, но другим составом — нужна проверка оператора
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.receipt import Receipt
from app.models.receipt_item import ReceiptItem
from app.services.ocr.pipeline import ParsedReceipt

logger = logging.getLogger(__name__)


class DuplicateKind(str, Enum):
    UNIQUE = "unique"
    IDENTICAL = "identical"
    CONFLICT = "conflict"


@dataclass
class ReceiptDuplicateResult:
    kind: DuplicateKind
    existing_id: uuid.UUID | None = None


async def check_receipt_duplicate(
    db: AsyncSession,
    user_id: uuid.UUID,
    parsed: ParsedReceipt,
) -> ReceiptDuplicateResult:
    """Проверить, есть ли в БД чек-дубль для данного распознанного результата.

    Возвращает ReceiptDuplicateResult с kind:
      UNIQUE    — нет дублей
      IDENTICAL — дубль найден, состав совпадает (пропустить)
      CONFLICT  — дубль найден, состав отличается (отправить оператору)
    """
    existing: Receipt | None = None

    # 1. Основной ключ: фискальные данные QR (fn+fd глобально уникальны)
    if parsed.fiscal_fn and parsed.fiscal_fd:
        result = await db.execute(
            select(Receipt)
            .where(
                and_(
                    Receipt.fiscal_fn == parsed.fiscal_fn,
                    Receipt.fiscal_fd == parsed.fiscal_fd,
                )
            )
            .options(selectinload(Receipt.items))
            .limit(1)
        )
        existing = result.scalar_one_or_none()
        if existing is not None:
            logger.info(
                "receipt dedup: fiscal match fn=%s fd=%s -> existing=%s",
                parsed.fiscal_fn, parsed.fiscal_fd, existing.id,
            )

    # 2. Фолбэк: user + дата + сумма (для чеков без QR)
    if existing is None and parsed.purchase_date and parsed.total_amount is not None:
        # Округляем до 2 знаков чтобы совпасть с Numeric(10,2) в БД
        amount_dec = parsed.total_amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        result = await db.execute(
            select(Receipt)
            .where(
                and_(
                    Receipt.user_id == user_id,
                    Receipt.purchase_date == parsed.purchase_date,
                    Receipt.total_amount == amount_dec,
                    # Исключаем сами дублёнки из поиска, чтобы не создавать цепочки
                    Receipt.duplicate_of_id.is_(None),
                )
            )
            .options(selectinload(Receipt.items))
            .limit(1)
        )
        existing = result.scalar_one_or_none()
        if existing is not None:
            logger.info(
                "receipt dedup: soft match user=%s date=%s amount=%s -> existing=%s",
                user_id, parsed.purchase_date, parsed.total_amount, existing.id,
            )

    if existing is None:
        return ReceiptDuplicateResult(kind=DuplicateKind.UNIQUE)

    # Сравниваем состав
    if _receipts_are_identical(existing, parsed):
        logger.info("receipt dedup: IDENTICAL existing=%s", existing.id)
        return ReceiptDuplicateResult(kind=DuplicateKind.IDENTICAL, existing_id=existing.id)

    logger.warning(
        "receipt dedup: CONFLICT existing=%s — состав отличается, отправляем на проверку",
        existing.id,
    )
    return ReceiptDuplicateResult(kind=DuplicateKind.CONFLICT, existing_id=existing.id)


def _receipts_are_identical(existing: Receipt, parsed: ParsedReceipt) -> bool:
    """Сравнить позиции существующего чека с распознанным результатом.

    Считаем чеки идентичными, если:
      - совпадают суммы (с погрешностью 0.01)
      - совпадает кол-во позиций
      - совпадают наименования препаратов (сортировкой)
    """
    # Суммы
    existing_amount = float(existing.total_amount) if existing.total_amount is not None else None
    parsed_amount = float(parsed.total_amount) if parsed.total_amount is not None else None
    if existing_amount is not None and parsed_amount is not None:
        if abs(existing_amount - parsed_amount) > 0.01:
            return False

    # Состав
    existing_items: list[ReceiptItem] = existing.items or []
    parsed_items = parsed.items or []

    if len(existing_items) != len(parsed_items):
        return False

    existing_names = sorted(
        (item.drug_name or "").strip().lower() for item in existing_items
    )
    parsed_names = sorted(
        (item.drug_name_raw or "").strip().lower() for item in parsed_items
    )
    if existing_names != parsed_names:
        return False

    # Суммы позиций (сортированные)
    existing_prices = sorted(
        float(item.total_price) if item.total_price is not None else 0.0
        for item in existing_items
    )
    parsed_prices = sorted(
        float(item.total_price) if item.total_price is not None else 0.0
        for item in parsed_items
    )
    return existing_prices == parsed_prices
