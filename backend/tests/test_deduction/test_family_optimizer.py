"""Тесты семейной оптимизации вычета."""

from decimal import Decimal

from app.services.deduction.family_optimizer import optimize_family
from app.services.deduction.types import (
    ExpenseCategory,
    ExpenseItem,
    PersonIncome,
)


class TestBasicOptimization:
    """Базовые сценарии оптимизации."""

    def test_under_limit_all_to_higher_rate(self):
        """Расходы под лимитом → всё на супруга с высшей ставкой."""
        expenses = [
            ExpenseItem(ExpenseCategory.MEDICINE, Decimal("100000"), 2025)
        ]
        income_a = PersonIncome(Decimal("3000000"), 2025)  # 15%
        income_b = PersonIncome(Decimal("2000000"), 2025)  # 13%

        result = optimize_family(expenses, income_a, income_b)
        # Всё на A (15%): 100000 * 0.15 = 15000
        assert result.person_a.deduction_amount == Decimal("15000.00")
        assert result.person_b.deduction_amount == Decimal("0")
        assert result.total_deduction == Decimal("15000.00")

    def test_over_limit_split_between_spouses(self):
        """Расходы > лимит → разделение между супругами."""
        expenses = [
            ExpenseItem(ExpenseCategory.MEDICINE, Decimal("250000"), 2024)
        ]
        income_a = PersonIncome(Decimal("2000000"), 2024)  # 13%
        income_b = PersonIncome(Decimal("2000000"), 2024)  # 13%

        result = optimize_family(expenses, income_a, income_b)
        # A: 150000 * 0.13 = 19500, B: 100000 * 0.13 = 13000
        assert result.total_deduction == Decimal("32500.00")
        assert result.gain_vs_naive > Decimal("0")

    def test_gain_vs_naive_is_positive(self):
        """Оптимизация не хуже наивного варианта."""
        expenses = [
            ExpenseItem(ExpenseCategory.MEDICINE, Decimal("280000"), 2024)
        ]
        income_a = PersonIncome(Decimal("2000000"), 2024)
        income_b = PersonIncome(Decimal("2000000"), 2024)

        result = optimize_family(expenses, income_a, income_b)
        # Наивный: min(280000, 150000) * 0.13 = 19500
        # Оптим: 150000*0.13 + 130000*0.13 = 19500 + 16900 = 36400
        assert result.total_deduction == Decimal("36400.00")
        assert result.gain_vs_naive == Decimal("16900.00")


class TestDifferentRates:
    """Супруги с разными ставками НДФЛ."""

    def test_higher_rate_spouse_gets_priority(self):
        """Супруг с 15% ставкой получает расходы первым."""
        expenses = [
            ExpenseItem(ExpenseCategory.MEDICINE, Decimal("150000"), 2025)
        ]
        income_a = PersonIncome(Decimal("2000000"), 2025)  # 13%
        income_b = PersonIncome(Decimal("3000000"), 2025)  # 15%

        result = optimize_family(expenses, income_a, income_b)
        # B (15%): 150000 → refund 22500
        assert result.total_deduction == Decimal("22500.00")

    def test_prd_scenario_280k_different_rates(self):
        """Сценарий из PRD: 280k, муж 13%, жена 15%."""
        expenses = [
            ExpenseItem(ExpenseCategory.MEDICINE, Decimal("280000"), 2025)
        ]
        income_husband = PersonIncome(Decimal("2000000"), 2025)  # 13%
        income_wife = PersonIncome(Decimal("3000000"), 2025)     # 15%

        result = optimize_family(expenses, income_husband, income_wife)
        # Жена (A, 15%): 150000 → 22500
        # Муж (B, 13%): 130000 → 16900
        # Итого: 39400
        assert result.person_a.deduction_amount == Decimal("22500.00")
        assert result.person_b.deduction_amount == Decimal("16900.00")
        assert result.total_deduction == Decimal("39400.00")


class TestExpensiveTreatment:
    """Дорогостоящее лечение в семейной оптимизации."""

    def test_expensive_goes_to_higher_rate(self):
        """Дорогостоящее лечение → супруг с высшей ставкой."""
        expenses = [
            ExpenseItem(ExpenseCategory.TREATMENT_EXPENSIVE, Decimal("500000"), 2025)
        ]
        income_a = PersonIncome(Decimal("2000000"), 2025)  # 13%
        income_b = PersonIncome(Decimal("3000000"), 2025)  # 15%

        result = optimize_family(expenses, income_a, income_b)
        # Всё на B (15%): 500000, refund = tax(3M) - tax(2.5M)
        # tax(3M) = 402000, tax(2.5M) = 2.4M*0.13 + 0.1M*0.15 = 312000+15000 = 327000
        # refund = 402000 - 327000 = 75000
        assert result.person_a.deduction_amount == Decimal("75000.00")
        assert result.person_b.deduction_amount == Decimal("0")


class TestEdgeCases:
    """Граничные случаи."""

    def test_empty_expenses(self):
        income_a = PersonIncome(Decimal("2000000"), 2024)
        income_b = PersonIncome(Decimal("2000000"), 2024)
        result = optimize_family([], income_a, income_b)
        assert result.total_deduction == Decimal("0")
        assert result.gain_vs_naive == Decimal("0")

    def test_equal_incomes(self):
        """При равных доходах — оптимизация всё равно работает."""
        expenses = [
            ExpenseItem(ExpenseCategory.MEDICINE, Decimal("250000"), 2024)
        ]
        income_a = PersonIncome(Decimal("2000000"), 2024)
        income_b = PersonIncome(Decimal("2000000"), 2024)

        result = optimize_family(expenses, income_a, income_b)
        assert result.total_deduction > Decimal("19500")  # больше чем наивный
