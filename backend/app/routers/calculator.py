"""Публичный калькулятор налогового вычета — без авторизации."""

from decimal import Decimal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.deduction.calculator import calculate_deduction
from app.services.deduction.family_optimizer import optimize_family
from app.services.deduction.types import (
    ExpenseCategory,
    ExpenseItem,
    PersonIncome,
)
from app.services.deduction.year_planner import plan_expenses_across_years

router = APIRouter(prefix="/calculator", tags=["calculator"])


# ---------------------------------------------------------------------------
# Shared schemas
# ---------------------------------------------------------------------------


class ExpenseInput(BaseModel):
    category: ExpenseCategory
    amount: Decimal = Field(gt=0)
    child_key: str | None = Field(default=None, description="Ключ ребёнка для education_child")


class CategoryBreakdownOut(BaseModel):
    category: ExpenseCategory
    amount: Decimal
    applied_to_limit: Decimal
    deduction: Decimal


class ChildDetailOut(BaseModel):
    child_key: str
    amount: Decimal
    limit: Decimal
    capped: Decimal
    lost: Decimal


class DeductionResultOut(BaseModel):
    tax_year: int
    total_expenses: Decimal
    capped_expenses: Decimal
    ndfl_rate: Decimal
    deduction_amount: Decimal
    limit_total: Decimal
    limit_used: Decimal
    limit_remaining: Decimal
    uncapped_amount: Decimal
    per_child_details: list[ChildDetailOut]
    breakdown: list[CategoryBreakdownOut]
    warnings: list[str]


# ---------------------------------------------------------------------------
# POST /calculator/simple
# ---------------------------------------------------------------------------


class SimpleRequest(BaseModel):
    expenses: list[ExpenseInput] = Field(min_length=1)
    tax_year: int = Field(ge=2020, le=2030)
    annual_income: Decimal = Field(gt=0, description="Годовой доход в рублях")


@router.post("/simple", response_model=DeductionResultOut, summary="Расчёт вычета (одиночный)")
async def calculate_simple(req: SimpleRequest) -> DeductionResultOut:
    """Рассчитать налоговый вычет для одного человека. Без регистрации."""
    items = [
        ExpenseItem(
            category=e.category,
            amount=e.amount,
            tax_year=req.tax_year,
            child_key=e.child_key,
        )
        for e in req.expenses
    ]
    income = PersonIncome(annual_income=req.annual_income, tax_year=req.tax_year)
    result = calculate_deduction(items, income)

    return DeductionResultOut(
        tax_year=result.tax_year,
        total_expenses=result.total_expenses,
        capped_expenses=result.capped_expenses,
        ndfl_rate=result.ndfl_rate,
        deduction_amount=result.deduction_amount,
        limit_total=result.limit_total,
        limit_used=result.limit_used,
        limit_remaining=result.limit_remaining,
        uncapped_amount=result.uncapped_amount,
        per_child_details=[
            ChildDetailOut(
                child_key=d.child_key,
                amount=d.amount,
                limit=d.limit,
                capped=d.capped,
                lost=d.lost,
            )
            for d in result.per_child_details
        ],
        breakdown=[
            CategoryBreakdownOut(
                category=b.category,
                amount=b.amount,
                applied_to_limit=b.applied_to_limit,
                deduction=b.deduction,
            )
            for b in result.breakdown
        ],
        warnings=result.warnings,
    )


# ---------------------------------------------------------------------------
# POST /calculator/family
# ---------------------------------------------------------------------------


class FamilyRequest(BaseModel):
    expenses: list[ExpenseInput] = Field(min_length=1)
    tax_year: int = Field(ge=2020, le=2030)
    income_a: Decimal = Field(gt=0, description="Годовой доход первого супруга")
    income_b: Decimal = Field(gt=0, description="Годовой доход второго супруга")


class FamilyResponse(BaseModel):
    optimized_a: DeductionResultOut
    optimized_b: DeductionResultOut
    total_deduction: Decimal
    gain_vs_naive: Decimal
    naive_deduction: Decimal
    recommendations: list[str]


@router.post("/family", response_model=FamilyResponse, summary="Семейная оптимизация вычета")
async def calculate_family(req: FamilyRequest) -> FamilyResponse:
    """Оптимальное распределение расходов между супругами. Без регистрации."""
    items = [
        ExpenseItem(
            category=e.category,
            amount=e.amount,
            tax_year=req.tax_year,
            child_key=e.child_key,
        )
        for e in req.expenses
    ]
    income_a = PersonIncome(annual_income=req.income_a, tax_year=req.tax_year)
    income_b = PersonIncome(annual_income=req.income_b, tax_year=req.tax_year)

    result = optimize_family(items, income_a, income_b)
    naive_deduction = result.total_deduction - result.gain_vs_naive

    def to_out(r) -> DeductionResultOut:
        return DeductionResultOut(
            tax_year=r.tax_year,
            total_expenses=r.total_expenses,
            capped_expenses=r.capped_expenses,
            ndfl_rate=r.ndfl_rate,
            deduction_amount=r.deduction_amount,
            limit_total=r.limit_total,
            limit_used=r.limit_used,
            limit_remaining=r.limit_remaining,
            uncapped_amount=r.uncapped_amount,
            per_child_details=[
                ChildDetailOut(**d.__dict__) for d in r.per_child_details
            ],
            breakdown=[
                CategoryBreakdownOut(**b.__dict__) for b in r.breakdown
            ],
            warnings=r.warnings,
        )

    return FamilyResponse(
        optimized_a=to_out(result.person_a),
        optimized_b=to_out(result.person_b),
        total_deduction=result.total_deduction,
        gain_vs_naive=result.gain_vs_naive,
        naive_deduction=naive_deduction,
        recommendations=result.recommendations,
    )


# ---------------------------------------------------------------------------
# POST /calculator/year-plan
# ---------------------------------------------------------------------------


class YearPlanRequest(BaseModel):
    total_amount: Decimal = Field(gt=0)
    category: ExpenseCategory
    start_year: int = Field(ge=2023, le=2030)
    annual_income: Decimal = Field(gt=0)


class YearBreakdownOut(BaseModel):
    tax_year: int
    amount: Decimal
    deduction_amount: Decimal


class YearPlanResponse(BaseModel):
    years: list[YearBreakdownOut]
    total_deduction: Decimal
    single_year_deduction: Decimal
    savings: Decimal
    recommended_split: dict[int, Decimal]


@router.post("/year-plan", response_model=YearPlanResponse, summary="Планирование расходов по годам")
async def calculate_year_plan(req: YearPlanRequest) -> YearPlanResponse:
    """Предложить разбивку крупного расхода по годам для максимизации вычета. Без регистрации."""
    income = PersonIncome(annual_income=req.annual_income, tax_year=req.start_year)
    result = plan_expenses_across_years(
        total_amount=req.total_amount,
        category=req.category,
        start_year=req.start_year,
        income=income,
    )

    years_out = [
        YearBreakdownOut(
            tax_year=r.tax_year,
            amount=result.recommended_split.get(r.tax_year, Decimal("0")),
            deduction_amount=r.deduction_amount,
        )
        for r in result.years
    ]

    return YearPlanResponse(
        years=years_out,
        total_deduction=result.total_deduction,
        single_year_deduction=result.single_year_deduction,
        savings=result.savings,
        recommended_split=result.recommended_split,
    )
