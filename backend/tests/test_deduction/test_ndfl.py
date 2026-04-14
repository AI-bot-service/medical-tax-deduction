"""Тесты расчёта НДФЛ и ставок."""

from decimal import Decimal

from app.services.deduction.ndfl import (
    compute_tax,
    compute_tax_refund,
    get_marginal_rate,
)


class TestFlatRate:
    """До 2024 года включительно — всегда 13%."""

    def test_flat_rate_2024(self):
        tax = compute_tax(Decimal("2000000"), 2024)
        assert tax == Decimal("260000.00")

    def test_flat_rate_5m_2024(self):
        tax = compute_tax(Decimal("5000000"), 2024)
        assert tax == Decimal("650000.00")

    def test_marginal_rate_always_13_for_2024(self):
        assert get_marginal_rate(Decimal("100000000"), 2024) == Decimal("0.13")


class TestProgressiveRate:
    """С 2025 года — прогрессивная шкала."""

    def test_bracket_1_under_2_4m(self):
        # Весь доход по ставке 13%
        tax = compute_tax(Decimal("2000000"), 2025)
        assert tax == Decimal("260000.00")

    def test_bracket_2_at_3m(self):
        # 2.4M * 13% + 0.6M * 15% = 312000 + 90000 = 402000
        tax = compute_tax(Decimal("3000000"), 2025)
        assert tax == Decimal("402000.00")

    def test_bracket_3_at_10m(self):
        # 2.4M*13% + 2.6M*15% + 5M*18% = 312000 + 390000 + 900000 = 1602000
        tax = compute_tax(Decimal("10000000"), 2025)
        assert tax == Decimal("1602000.00")

    def test_marginal_rate_under_2_4m(self):
        assert get_marginal_rate(Decimal("2000000"), 2025) == Decimal("0.13")

    def test_marginal_rate_at_3m(self):
        assert get_marginal_rate(Decimal("3000000"), 2025) == Decimal("0.15")

    def test_marginal_rate_at_10m(self):
        assert get_marginal_rate(Decimal("10000000"), 2025) == Decimal("0.18")


class TestTaxRefund:
    """Расчёт возврата НДФЛ."""

    def test_refund_flat_rate(self):
        # 2024: 150000 * 0.13 = 19500
        refund = compute_tax_refund(Decimal("150000"), Decimal("2000000"), 2024)
        assert refund == Decimal("19500.00")

    def test_refund_progressive_within_one_bracket(self):
        # 2025, доход 2M (целиком в 13%): вычет 150k → 150000 * 0.13 = 19500
        refund = compute_tax_refund(Decimal("150000"), Decimal("2000000"), 2025)
        assert refund == Decimal("19500.00")

    def test_refund_progressive_crosses_bracket(self):
        # 2025, доход 3M: маргинальная 15%.
        # Вычет 150000 снижает доход с 3M до 2.85M.
        # tax(3M) = 402000, tax(2.85M) = 2.4M*0.13 + 0.45M*0.15 = 312000+67500 = 379500
        # Refund = 402000 - 379500 = 22500
        refund = compute_tax_refund(Decimal("150000"), Decimal("3000000"), 2025)
        assert refund == Decimal("22500.00")

    def test_refund_zero_for_zero_deduction(self):
        refund = compute_tax_refund(Decimal("0"), Decimal("2000000"), 2024)
        assert refund == Decimal("0")

    def test_refund_capped_by_income(self):
        # Вычет больше дохода — ограничивается доходом
        refund = compute_tax_refund(Decimal("5000000"), Decimal("100000"), 2024)
        expected = compute_tax(Decimal("100000"), 2024)
        assert refund == expected
