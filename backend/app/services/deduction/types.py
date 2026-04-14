"""Типы данных движка расчёта вычета. Только stdlib + decimal."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
import sys

if sys.version_info >= (3, 11):
    from enum import StrEnum
else:
    import enum

    class StrEnum(str, enum.Enum):
        pass


class ExpenseCategory(StrEnum):
    MEDICINE = "medicine"
    TREATMENT_REGULAR = "treatment_regular"
    TREATMENT_EXPENSIVE = "treatment_expensive"
    VHI = "vhi"
    EDUCATION_SELF = "education_self"
    EDUCATION_CHILD = "education_child"
    EDUCATION_SPOUSE = "education_spouse"
    FITNESS = "fitness"


@dataclass(frozen=True)
class ExpenseItem:
    """Один расход для расчёта вычета."""

    category: ExpenseCategory
    amount: Decimal
    tax_year: int
    child_key: str | None = None  # идентификатор ребёнка для EDUCATION_CHILD


@dataclass(frozen=True)
class PersonIncome:
    """Годовой доход одного человека."""

    annual_income: Decimal
    tax_year: int


@dataclass(frozen=True)
class ChildDeductionDetail:
    """Детализация вычета на обучение одного ребёнка."""

    child_key: str
    amount: Decimal
    limit: Decimal
    capped: Decimal
    lost: Decimal


@dataclass(frozen=True)
class CategoryBreakdown:
    """Разбивка вычета по одной категории расходов."""

    category: ExpenseCategory
    amount: Decimal
    applied_to_limit: Decimal
    deduction: Decimal


@dataclass(frozen=True)
class DeductionResult:
    """Результат расчёта вычета для одного человека за один год."""

    tax_year: int
    total_expenses: Decimal
    capped_expenses: Decimal
    ndfl_rate: Decimal
    deduction_amount: Decimal
    limit_total: Decimal
    limit_used: Decimal
    limit_remaining: Decimal
    uncapped_amount: Decimal
    per_child_details: list[ChildDeductionDetail] = field(default_factory=list)
    breakdown: list[CategoryBreakdown] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class FamilyResult:
    """Результат семейной оптимизации."""

    person_a: DeductionResult
    person_b: DeductionResult
    total_deduction: Decimal
    gain_vs_naive: Decimal
    recommendations: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class YearPlanResult:
    """Результат планирования расходов по годам."""

    years: list[DeductionResult]
    total_deduction: Decimal
    single_year_deduction: Decimal
    savings: Decimal
    recommended_split: dict[int, Decimal] = field(default_factory=dict)
