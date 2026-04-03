"""Роутер расходов пользователя — разбивка по категориям."""

from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.enums import ExpenseCategory
from app.models.expense import Expense
from app.models.user import User

router = APIRouter(prefix="/expenses", tags=["expenses"])

# Порядок и набор категорий, возвращаемых в ответе
_RESPONSE_CATEGORIES: list[ExpenseCategory] = [
    ExpenseCategory.MEDICINE,
    ExpenseCategory.TREATMENT_REGULAR,
    ExpenseCategory.TREATMENT_EXPENSIVE,
    ExpenseCategory.VHI,
    ExpenseCategory.EDUCATION_SELF,
    ExpenseCategory.EDUCATION_CHILD,
    ExpenseCategory.EDUCATION_SPOUSE,
    ExpenseCategory.FITNESS,
]


class CategoryAmount(BaseModel):
    category_key: str
    amount: Decimal


class ExpenseCategoriesResponse(BaseModel):
    year: int
    categories: list[CategoryAmount]


@router.get("/categories", response_model=ExpenseCategoriesResponse)
async def get_expense_categories(
    year: int = Query(..., ge=2000, le=2100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ExpenseCategoriesResponse:
    """Вернуть расходы пользователя сгруппированные по категориям за указанный год.

    Требует авторизации. Все категории присутствуют в ответе (amount=0 если нет расходов).
    """
    result = await db.execute(
        select(Expense.category, func.sum(Expense.amount).label("total"))
        .where(Expense.user_id == current_user.id, Expense.tax_year == year)
        .group_by(Expense.category)
    )
    rows = result.all()

    totals: dict[ExpenseCategory, Decimal] = {
        row.category: Decimal(str(row.total)) for row in rows
    }

    categories = [
        CategoryAmount(
            category_key=cat.value,
            amount=totals.get(cat, Decimal("0")),
        )
        for cat in _RESPONSE_CATEGORIES
    ]

    return ExpenseCategoriesResponse(year=year, categories=categories)
