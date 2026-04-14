"""Планирование разбивки крупных расходов по годам."""

from decimal import Decimal

from .calculator import calculate_deduction
from .limits import UNCAPPED_CATEGORIES, get_aggregate_limit
from .types import (
    DeductionResult,
    ExpenseCategory,
    ExpenseItem,
    PersonIncome,
    YearPlanResult,
)


def plan_expenses_across_years(
    total_amount: Decimal,
    category: ExpenseCategory,
    start_year: int,
    income: PersonIncome,
    max_years: int = 3,
) -> YearPlanResult:
    """Предложить разбивку крупного расхода по годам.

    Лимит не переносится на следующий год — остаток сгорает.
    Поэтому крупные расходы выгоднее распределять по годам.

    Для дорогостоящего лечения (без лимита) разбивка не нужна.
    """
    # Дорогостоящее лечение — без лимита, разбивка бессмысленна
    if category in UNCAPPED_CATEGORIES:
        expense = ExpenseItem(
            category=category, amount=total_amount, tax_year=start_year
        )
        single_income = PersonIncome(
            annual_income=income.annual_income, tax_year=start_year
        )
        result = calculate_deduction([expense], single_income)
        return YearPlanResult(
            years=[result],
            total_deduction=result.deduction_amount,
            single_year_deduction=result.deduction_amount,
            savings=Decimal("0"),
            recommended_split={start_year: total_amount},
        )

    # Рассчитать single-year вариант
    single_expense = ExpenseItem(
        category=category, amount=total_amount, tax_year=start_year
    )
    single_income = PersonIncome(
        annual_income=income.annual_income, tax_year=start_year
    )
    single_result = calculate_deduction([single_expense], single_income)

    # Разбить по годам: каждый год — до лимита
    remaining = total_amount
    year_results: list[DeductionResult] = []
    recommended_split: dict[int, Decimal] = {}

    for i in range(max_years):
        if remaining <= 0:
            break
        year = start_year + i
        limit = get_aggregate_limit(year)
        year_amount = min(remaining, limit)

        expense = ExpenseItem(
            category=category, amount=year_amount, tax_year=year
        )
        year_income = PersonIncome(
            annual_income=income.annual_income, tax_year=year
        )
        result = calculate_deduction([expense], year_income)
        year_results.append(result)
        recommended_split[year] = year_amount
        remaining -= year_amount

    # Если ещё остались расходы после max_years — последний год берёт всё
    if remaining > 0 and year_results:
        last_year = start_year + len(year_results) - 1
        extra_amount = recommended_split[last_year] + remaining
        recommended_split[last_year] = extra_amount
        expense = ExpenseItem(
            category=category, amount=extra_amount, tax_year=last_year
        )
        year_income = PersonIncome(
            annual_income=income.annual_income, tax_year=last_year
        )
        year_results[-1] = calculate_deduction([expense], year_income)

    total_multi = sum(
        (r.deduction_amount for r in year_results), Decimal("0")
    )

    return YearPlanResult(
        years=year_results,
        total_deduction=total_multi,
        single_year_deduction=single_result.deduction_amount,
        savings=total_multi - single_result.deduction_amount,
        recommended_split=recommended_split,
    )
