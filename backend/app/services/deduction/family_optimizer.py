"""Семейная оптимизация налогового вычета между супругами."""

from collections import defaultdict
from dataclasses import replace
from decimal import Decimal

from .calculator import calculate_deduction
from .limits import (
    AGGREGATE_CATEGORIES,
    PER_CHILD_CATEGORIES,
    UNCAPPED_CATEGORIES,
    get_aggregate_limit,
)
from .ndfl import get_marginal_rate
from .types import (
    ExpenseItem,
    FamilyResult,
    PersonIncome,
)


def optimize_family(
    expenses: list[ExpenseItem],
    income_a: PersonIncome,
    income_b: PersonIncome,
) -> FamilyResult:
    """Оптимальное распределение расходов между двумя супругами.

    Алгоритм:
    1. Определить кто A (выше маргинальная ставка), кто B
    2. Uncapped (код 2) → всё на A (больше ставка = больше возврат)
    3. Per-child → на A
    4. Aggregate:
       a) Сумма <= лимит → всё на A
       b) Сумма > лимит → лимит на A, остаток (до лимита B) на B
       c) Остаток > 2 * лимит → warning о потере
    5. Рассчитать DeductionResult для A и B
    6. Сравнить с наивным вариантом (всё на одного)
    """
    tax_year = income_a.tax_year
    rate_a = get_marginal_rate(income_a.annual_income, tax_year)
    rate_b = get_marginal_rate(income_b.annual_income, tax_year)

    # A — тот, у кого выше ставка; при равных — у кого выше доход
    if rate_b > rate_a or (rate_b == rate_a and income_b.annual_income > income_a.annual_income):
        income_a, income_b = income_b, income_a

    recommendations: list[str] = []
    agg_limit = get_aggregate_limit(tax_year)

    # Разделяем расходы по пулам
    uncapped_items: list[ExpenseItem] = []
    per_child_items: list[ExpenseItem] = []
    aggregate_items: list[ExpenseItem] = []

    for e in expenses:
        if e.category in UNCAPPED_CATEGORIES:
            uncapped_items.append(e)
        elif e.category in PER_CHILD_CATEGORIES:
            per_child_items.append(e)
        elif e.category in AGGREGATE_CATEGORIES:
            aggregate_items.append(e)
        else:
            aggregate_items.append(e)

    # --- Распределение ---
    expenses_a: list[ExpenseItem] = []
    expenses_b: list[ExpenseItem] = []

    # 1. Uncapped → всё на A (выше ставка)
    expenses_a.extend(uncapped_items)
    if uncapped_items:
        recommendations.append(
            "Дорогостоящее лечение назначено супругу с более высокой ставкой НДФЛ"
        )

    # 2. Per-child → на A
    expenses_a.extend(per_child_items)

    # 3. Aggregate — ключевая оптимизация
    aggregate_total = sum((e.amount for e in aggregate_items), Decimal("0"))

    if aggregate_total <= agg_limit:
        # Всё влезает в один лимит → на A
        expenses_a.extend(aggregate_items)
    else:
        # Нужно разделить: лимит на A, остаток на B
        # Сортируем по убыванию суммы для лучшего заполнения
        sorted_agg = sorted(aggregate_items, key=lambda e: e.amount, reverse=True)

        budget_a = agg_limit
        for e in sorted_agg:
            if budget_a >= e.amount:
                expenses_a.append(e)
                budget_a -= e.amount
            elif budget_a > 0:
                # Разбиваем расход на двоих
                expenses_a.append(replace(e, amount=budget_a))
                expenses_b.append(replace(e, amount=e.amount - budget_a))
                budget_a = Decimal("0")
            else:
                expenses_b.append(e)

        overflow_b = sum((e.amount for e in expenses_b), Decimal("0"))
        if overflow_b > agg_limit:
            lost = overflow_b - agg_limit
            recommendations.append(
                f"Даже при разделении между супругами теряется {lost}₽. "
                f"Рассмотрите перенос части расходов на другой год."
            )
        else:
            recommendations.append(
                f"Расходы ({aggregate_total}₽) разделены между супругами "
                f"для максимального использования обоих лимитов."
            )

    # --- Расчёт для каждого ---
    result_a = calculate_deduction(expenses_a, income_a)
    result_b = calculate_deduction(expenses_b, income_b)
    total_optimized = result_a.deduction_amount + result_b.deduction_amount

    # --- Наивный вариант: всё на A ---
    naive = calculate_deduction(expenses, income_a)
    gain = total_optimized - naive.deduction_amount

    if gain > 0:
        recommendations.append(
            f"Выигрыш от оптимизации: +{gain}₽ "
            f"(оптимизированный: {total_optimized}₽ vs наивный: {naive.deduction_amount}₽)"
        )

    return FamilyResult(
        person_a=result_a,
        person_b=result_b,
        total_deduction=total_optimized,
        gain_vs_naive=gain,
        recommendations=recommendations,
    )
