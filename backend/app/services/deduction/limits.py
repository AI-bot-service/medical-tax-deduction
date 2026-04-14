"""Таблица лимитов социального налогового вычета по годам."""

from decimal import Decimal

from .types import ExpenseCategory

# Совокупный лимит (все категории кроме дорогостоящего лечения и обучения детей)
_AGGREGATE_LIMITS: list[tuple[int, int, Decimal]] = [
    (2000, 2023, Decimal("120000")),
    (2024, 9999, Decimal("150000")),
]

# Лимит на обучение одного ребёнка
_CHILD_EDUCATION_LIMITS: list[tuple[int, int, Decimal]] = [
    (2000, 2023, Decimal("50000")),
    (2024, 9999, Decimal("110000")),
]

# Категории БЕЗ лимита (дорогостоящее лечение, код 2)
UNCAPPED_CATEGORIES: frozenset[ExpenseCategory] = frozenset(
    {ExpenseCategory.TREATMENT_EXPENSIVE}
)

# Категории с отдельным лимитом на каждого ребёнка
PER_CHILD_CATEGORIES: frozenset[ExpenseCategory] = frozenset(
    {ExpenseCategory.EDUCATION_CHILD}
)

# Категории, входящие в совокупный лимит
AGGREGATE_CATEGORIES: frozenset[ExpenseCategory] = frozenset(
    {
        ExpenseCategory.MEDICINE,
        ExpenseCategory.TREATMENT_REGULAR,
        ExpenseCategory.VHI,
        ExpenseCategory.EDUCATION_SELF,
        ExpenseCategory.EDUCATION_SPOUSE,
        ExpenseCategory.FITNESS,
    }
)

# Обучение супруга доступно только с 2024 года
EDUCATION_SPOUSE_MIN_YEAR = 2024


def _lookup(table: list[tuple[int, int, Decimal]], tax_year: int) -> Decimal:
    for year_from, year_to, limit in table:
        if year_from <= tax_year <= year_to:
            return limit
    raise ValueError(f"Нет данных о лимите для года {tax_year}")


def get_aggregate_limit(tax_year: int) -> Decimal:
    """Совокупный лимит вычета для данного налогового года."""
    return _lookup(_AGGREGATE_LIMITS, tax_year)


def get_child_education_limit(tax_year: int) -> Decimal:
    """Лимит вычета на обучение одного ребёнка для данного налогового года."""
    return _lookup(_CHILD_EDUCATION_LIMITS, tax_year)
