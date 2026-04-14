"""Расчёт НДФЛ с учётом прогрессивной шкалы (с 2025 года)."""

from decimal import Decimal, ROUND_HALF_UP

_TWO_PLACES = Decimal("0.01")

# Прогрессивная шкала НДФЛ (с 2025 года).
# (порог_от, порог_до, ставка) — порог_до включительно.
_PROGRESSIVE_BRACKETS: list[tuple[Decimal, Decimal, Decimal]] = [
    (Decimal("0"), Decimal("2400000"), Decimal("0.13")),
    (Decimal("2400000"), Decimal("5000000"), Decimal("0.15")),
    (Decimal("5000000"), Decimal("20000000"), Decimal("0.18")),
    (Decimal("20000000"), Decimal("50000000"), Decimal("0.20")),
    (Decimal("50000000"), Decimal("10000000000"), Decimal("0.22")),
]

_FLAT_RATE = Decimal("0.13")


def _compute_tax_progressive(income: Decimal) -> Decimal:
    """Рассчитать НДФЛ по прогрессивной шкале."""
    if income <= 0:
        return Decimal("0")
    tax = Decimal("0")
    remaining = income
    for bracket_from, bracket_to, rate in _PROGRESSIVE_BRACKETS:
        bracket_size = bracket_to - bracket_from
        taxable_in_bracket = min(remaining, bracket_size)
        if taxable_in_bracket <= 0:
            break
        tax += taxable_in_bracket * rate
        remaining -= taxable_in_bracket
    return tax.quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)


def compute_tax(income: Decimal, tax_year: int) -> Decimal:
    """Рассчитать полный НДФЛ с дохода за год."""
    if tax_year <= 2024:
        return (income * _FLAT_RATE).quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)
    return _compute_tax_progressive(income)


def compute_tax_refund(
    deduction_base: Decimal,
    annual_income: Decimal,
    tax_year: int,
) -> Decimal:
    """Рассчитать сумму возврата НДФЛ.

    Для плоской ставки (<=2024): deduction_base * 0.13.
    Для прогрессивной (>=2025): tax(income) - tax(income - deduction_base).
    Это корректная формула — вычет снижает доход «сверху», убирая налог
    по самой высокой маргинальной ставке.
    """
    if deduction_base <= 0:
        return Decimal("0")
    if deduction_base > annual_income:
        deduction_base = annual_income

    tax_before = compute_tax(annual_income, tax_year)
    tax_after = compute_tax(annual_income - deduction_base, tax_year)
    refund = tax_before - tax_after
    return refund.quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)


def get_marginal_rate(annual_income: Decimal, tax_year: int) -> Decimal:
    """Маргинальная ставка НДФЛ (ставка на последний рубль дохода)."""
    if tax_year <= 2024:
        return _FLAT_RATE
    for bracket_from, bracket_to, rate in _PROGRESSIVE_BRACKETS:
        if annual_income <= bracket_to:
            return rate
    return _PROGRESSIVE_BRACKETS[-1][2]
