"""Основной расчёт социального налогового вычета."""

from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from .limits import (
    AGGREGATE_CATEGORIES,
    EDUCATION_SPOUSE_MIN_YEAR,
    PER_CHILD_CATEGORIES,
    UNCAPPED_CATEGORIES,
    get_aggregate_limit,
    get_child_education_limit,
)
from .ndfl import compute_tax_refund, get_marginal_rate
from .types import (
    CategoryBreakdown,
    ChildDeductionDetail,
    DeductionResult,
    ExpenseCategory,
    ExpenseItem,
    PersonIncome,
)

_TWO_PLACES = Decimal("0.01")


def calculate_deduction(
    expenses: list[ExpenseItem],
    income: PersonIncome,
) -> DeductionResult:
    """Рассчитать вычет для одного человека за один год.

    Алгоритм:
    1. Разделить расходы на три пула:
       a) uncapped (treatment_expensive) — без лимита
       b) per_child (education_child) — отдельный лимит на каждого ребёнка
       c) aggregate (всё остальное) — совокупный лимит
    2. Применить лимиты к каждому пулу
    3. deduction_base = uncapped + sum(per_child_capped) + aggregate_capped
    4. refund = compute_tax_refund(deduction_base, income, year)
    """
    tax_year = income.tax_year
    warnings: list[str] = []

    # Фильтруем расходы по году
    year_expenses = [e for e in expenses if e.tax_year == tax_year]

    # Валидация: обучение супруга только с 2024
    filtered: list[ExpenseItem] = []
    for e in year_expenses:
        if (
            e.category == ExpenseCategory.EDUCATION_SPOUSE
            and tax_year < EDUCATION_SPOUSE_MIN_YEAR
        ):
            warnings.append(
                f"Вычет на обучение супруга доступен только с {EDUCATION_SPOUSE_MIN_YEAR} года"
            )
            continue
        filtered.append(e)

    # --- Разделяем на три пула ---
    uncapped_items: list[ExpenseItem] = []
    per_child_items: defaultdict[str, list[ExpenseItem]] = defaultdict(list)
    aggregate_items: list[ExpenseItem] = []

    for e in filtered:
        if e.category in UNCAPPED_CATEGORIES:
            uncapped_items.append(e)
        elif e.category in PER_CHILD_CATEGORIES:
            key = e.child_key or "_default"
            per_child_items[key].append(e)
        elif e.category in AGGREGATE_CATEGORIES:
            aggregate_items.append(e)
        else:
            aggregate_items.append(e)

    # --- Uncapped (дорогостоящее лечение) ---
    uncapped_total = sum((e.amount for e in uncapped_items), Decimal("0"))

    # --- Per-child (обучение детей) ---
    child_limit = get_child_education_limit(tax_year)
    per_child_details: list[ChildDeductionDetail] = []
    per_child_capped_total = Decimal("0")

    for child_key, items in sorted(per_child_items.items()):
        child_amount = sum((e.amount for e in items), Decimal("0"))
        capped = min(child_amount, child_limit)
        lost = child_amount - capped
        per_child_details.append(
            ChildDeductionDetail(
                child_key=child_key,
                amount=child_amount,
                limit=child_limit,
                capped=capped,
                lost=lost,
            )
        )
        per_child_capped_total += capped
        if lost > 0:
            warnings.append(
                f"Расходы на обучение ребёнка '{child_key}' ({child_amount}₽) "
                f"превышают лимит {child_limit}₽, потеря: {lost}₽"
            )

    # --- Aggregate (совокупный лимит) ---
    agg_limit = get_aggregate_limit(tax_year)
    aggregate_total = sum((e.amount for e in aggregate_items), Decimal("0"))
    aggregate_capped = min(aggregate_total, agg_limit)
    aggregate_lost = aggregate_total - aggregate_capped

    if aggregate_lost > 0:
        warnings.append(
            f"Совокупные расходы ({aggregate_total}₽) превышают лимит {agg_limit}₽, "
            f"потеря: {aggregate_lost}₽. Рассмотрите оформление на супруга или "
            f"разбивку по годам."
        )

    # --- Итого ---
    total_expenses = uncapped_total + per_child_capped_total + aggregate_total
    # Для per_child учитываем полную сумму в total_expenses
    total_expenses = (
        uncapped_total
        + sum((d.amount for d in per_child_details), Decimal("0"))
        + aggregate_total
    )
    capped_expenses = uncapped_total + per_child_capped_total + aggregate_capped
    deduction_base = capped_expenses

    refund = compute_tax_refund(deduction_base, income.annual_income, tax_year)
    ndfl_rate = get_marginal_rate(income.annual_income, tax_year)

    # --- Breakdown по категориям ---
    category_amounts: defaultdict[ExpenseCategory, Decimal] = defaultdict(Decimal)
    for e in filtered:
        category_amounts[e.category] += e.amount

    breakdown: list[CategoryBreakdown] = []
    for cat, amount in sorted(category_amounts.items(), key=lambda x: x[0].value):
        if cat in UNCAPPED_CATEGORIES:
            applied = amount
        elif cat in PER_CHILD_CATEGORIES:
            applied = sum(
                (d.capped for d in per_child_details), Decimal("0")
            )
        else:
            # Пропорциональное распределение лимита по aggregate-категориям
            if aggregate_total > 0:
                share = amount / aggregate_total
                applied = (aggregate_capped * share).quantize(
                    _TWO_PLACES, rounding=ROUND_HALF_UP
                )
            else:
                applied = Decimal("0")

        cat_deduction = compute_tax_refund(applied, income.annual_income, tax_year)
        breakdown.append(
            CategoryBreakdown(
                category=cat,
                amount=amount,
                applied_to_limit=applied,
                deduction=cat_deduction,
            )
        )

    return DeductionResult(
        tax_year=tax_year,
        total_expenses=total_expenses,
        capped_expenses=capped_expenses,
        ndfl_rate=ndfl_rate,
        deduction_amount=refund,
        limit_total=agg_limit,
        limit_used=aggregate_capped,
        limit_remaining=agg_limit - aggregate_capped,
        uncapped_amount=uncapped_total,
        per_child_details=per_child_details,
        breakdown=breakdown,
        warnings=warnings,
    )
