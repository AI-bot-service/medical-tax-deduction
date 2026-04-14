"""Тесты планирования расходов по годам."""

from decimal import Decimal

from app.services.deduction.types import ExpenseCategory, PersonIncome
from app.services.deduction.year_planner import plan_expenses_across_years


class TestBasicPlanning:
    """Базовые сценарии разбивки."""

    def test_under_limit_no_split(self):
        """Расходы под лимитом — один год, без разбивки."""
        income = PersonIncome(Decimal("2000000"), 2024)
        result = plan_expenses_across_years(
            Decimal("100000"), ExpenseCategory.MEDICINE, 2024, income
        )
        assert len(result.years) == 1
        assert result.savings == Decimal("0")
        assert result.recommended_split == {2024: Decimal("100000")}

    def test_split_300k_into_two_years(self):
        """300k → 150k + 150k по годам."""
        income = PersonIncome(Decimal("2000000"), 2024)
        result = plan_expenses_across_years(
            Decimal("300000"), ExpenseCategory.MEDICINE, 2024, income
        )
        assert len(result.years) == 2
        assert result.recommended_split[2024] == Decimal("150000")
        assert result.recommended_split[2025] == Decimal("150000")
        # single year: 150000 * 0.13 = 19500
        # two years: 150000 * 0.13 + 150000 * 0.13 = 39000
        # (second year may use progressive rate)
        assert result.total_deduction > result.single_year_deduction
        assert result.savings > Decimal("0")

    def test_split_400k_into_three_years(self):
        """400k → 150k + 150k + 100k."""
        income = PersonIncome(Decimal("2000000"), 2024)
        result = plan_expenses_across_years(
            Decimal("400000"), ExpenseCategory.MEDICINE, 2024, income
        )
        assert len(result.years) == 3
        assert result.recommended_split[2024] == Decimal("150000")
        assert result.recommended_split[2025] == Decimal("150000")
        assert result.recommended_split[2026] == Decimal("100000")


class TestExpensiveTreatmentNoSplit:
    """Дорогостоящее лечение — разбивка бессмысленна."""

    def test_no_split_for_expensive(self):
        income = PersonIncome(Decimal("2000000"), 2024)
        result = plan_expenses_across_years(
            Decimal("500000"), ExpenseCategory.TREATMENT_EXPENSIVE, 2024, income
        )
        assert len(result.years) == 1
        assert result.savings == Decimal("0")
        assert result.recommended_split == {2024: Decimal("500000")}


class TestSavingsCalculation:
    """Проверка расчёта экономии."""

    def test_savings_positive_for_large_amount(self):
        income = PersonIncome(Decimal("2000000"), 2024)
        result = plan_expenses_across_years(
            Decimal("250000"), ExpenseCategory.MEDICINE, 2024, income
        )
        # Single: min(250000, 150000) * 0.13 = 19500
        assert result.single_year_deduction == Decimal("19500.00")
        # Multi: 150000*0.13 + 100000*0.13 = 19500 + 13000 = 32500
        # (2025 может быть прогрессивный, но доход 2M → 13%)
        assert result.total_deduction > result.single_year_deduction

    def test_exact_limit_no_savings(self):
        """Если расходы ровно по лимиту — экономии нет."""
        income = PersonIncome(Decimal("2000000"), 2024)
        result = plan_expenses_across_years(
            Decimal("150000"), ExpenseCategory.MEDICINE, 2024, income
        )
        assert result.savings == Decimal("0")
        assert len(result.years) == 1
