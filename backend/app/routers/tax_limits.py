"""Роутер лимитов социального налогового вычета."""

from decimal import Decimal

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.services.deduction.limits import (
    PER_CHILD_CATEGORIES,
    UNCAPPED_CATEGORIES,
    get_aggregate_limit,
    get_child_education_limit,
)
from app.services.deduction.types import ExpenseCategory

router = APIRouter(prefix="/tax-limits", tags=["tax-limits"])

_FLAT_RATE = Decimal("0.13")


class TaxLimitItem(BaseModel):
    type_key: str
    type_name: str
    limit_amount: int | None
    refund_amount: int | None
    refund_percent: int | None
    is_uncapped: bool
    is_separate: bool


class TaxLimitsResponse(BaseModel):
    year: int
    combined_limit: int
    limits: list[TaxLimitItem]


_CATEGORY_META: dict[ExpenseCategory, dict] = {
    ExpenseCategory.TREATMENT_REGULAR: {
        "type_name": "Лечение (обычное)",
        "is_separate": False,
    },
    ExpenseCategory.TREATMENT_EXPENSIVE: {
        "type_name": "Дорогостоящее лечение",
        "is_separate": True,
    },
    ExpenseCategory.EDUCATION_SELF: {
        "type_name": "Обучение (своё)",
        "is_separate": False,
    },
    ExpenseCategory.EDUCATION_CHILD: {
        "type_name": "Обучение ребёнка",
        "is_separate": True,
    },
}

# Порядок отображения категорий
_DISPLAY_ORDER = [
    ExpenseCategory.TREATMENT_REGULAR,
    ExpenseCategory.TREATMENT_EXPENSIVE,
    ExpenseCategory.EDUCATION_SELF,
    ExpenseCategory.EDUCATION_CHILD,
]


@router.get("", response_model=TaxLimitsResponse)
async def get_tax_limits(year: int = Query(..., ge=2000, le=2100)) -> TaxLimitsResponse:
    """Вернуть лимиты социального налогового вычета за указанный год.

    Не требует авторизации. Данные берутся из limits.py и ndfl.py.
    """
    combined_limit = get_aggregate_limit(year)
    child_limit = get_child_education_limit(year)

    items: list[TaxLimitItem] = []
    for category in _DISPLAY_ORDER:
        meta = _CATEGORY_META[category]
        is_uncapped = category in UNCAPPED_CATEGORIES

        if is_uncapped:
            items.append(
                TaxLimitItem(
                    type_key=category.value,
                    type_name=meta["type_name"],
                    limit_amount=None,
                    refund_amount=None,
                    refund_percent=13,
                    is_uncapped=True,
                    is_separate=meta["is_separate"],
                )
            )
        elif category in PER_CHILD_CATEGORIES:
            limit_int = int(child_limit)
            refund_int = int((child_limit * _FLAT_RATE).quantize(Decimal("1")))
            items.append(
                TaxLimitItem(
                    type_key=category.value,
                    type_name=meta["type_name"],
                    limit_amount=limit_int,
                    refund_amount=refund_int,
                    refund_percent=None,
                    is_uncapped=False,
                    is_separate=meta["is_separate"],
                )
            )
        else:
            limit_int = int(combined_limit)
            refund_int = int((combined_limit * _FLAT_RATE).quantize(Decimal("1")))
            items.append(
                TaxLimitItem(
                    type_key=category.value,
                    type_name=meta["type_name"],
                    limit_amount=limit_int,
                    refund_amount=refund_int,
                    refund_percent=None,
                    is_uncapped=False,
                    is_separate=meta["is_separate"],
                )
            )

    return TaxLimitsResponse(
        year=year,
        combined_limit=int(combined_limit),
        limits=items,
    )
