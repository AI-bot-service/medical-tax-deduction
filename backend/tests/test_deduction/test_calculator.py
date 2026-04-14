"""Тесты основного калькулятора вычета."""

from decimal import Decimal

import pytest

from app.services.deduction.calculator import calculate_deduction
from app.services.deduction.types import (
    ExpenseCategory,
    ExpenseItem,
    PersonIncome,
)


class TestSimpleMedicine:
    """Простые сценарии с лекарствами."""

    def test_under_limit_2024(self, income_2024_2m):
        expenses = [
            ExpenseItem(ExpenseCategory.MEDICINE, Decimal("50000"), 2024)
        ]
        result = calculate_deduction(expenses, income_2024_2m)
        assert result.deduction_amount == Decimal("6500.00")
        assert result.limit_used == Decimal("50000")
        assert result.limit_remaining == Decimal("100000")

    def test_over_limit_2024(self, income_2024_2m):
        expenses = [
            ExpenseItem(ExpenseCategory.MEDICINE, Decimal("200000"), 2024)
        ]
        result = calculate_deduction(expenses, income_2024_2m)
        # 150000 * 0.13 = 19500
        assert result.deduction_amount == Decimal("19500.00")
        assert result.limit_used == Decimal("150000")
        assert result.limit_remaining == Decimal("0")
        assert len(result.warnings) > 0

    def test_limit_120k_for_2023(self):
        income = PersonIncome(Decimal("2000000"), 2023)
        expenses = [
            ExpenseItem(ExpenseCategory.MEDICINE, Decimal("150000"), 2023)
        ]
        result = calculate_deduction(expenses, income)
        # Лимит 120000 для 2023: 120000 * 0.13 = 15600
        assert result.deduction_amount == Decimal("15600.00")
        assert result.limit_total == Decimal("120000")


class TestExpensiveTreatment:
    """Дорогостоящее лечение — без лимита."""

    def test_no_limit(self, income_2024_2m):
        expenses = [
            ExpenseItem(ExpenseCategory.TREATMENT_EXPENSIVE, Decimal("500000"), 2024)
        ]
        result = calculate_deduction(expenses, income_2024_2m)
        # 500000 * 0.13 = 65000
        assert result.deduction_amount == Decimal("65000.00")
        assert result.uncapped_amount == Decimal("500000")
        assert result.limit_used == Decimal("0")

    def test_mixed_with_regular(self, income_2024_2m):
        expenses = [
            ExpenseItem(ExpenseCategory.TREATMENT_EXPENSIVE, Decimal("300000"), 2024),
            ExpenseItem(ExpenseCategory.TREATMENT_REGULAR, Decimal("100000"), 2024),
        ]
        result = calculate_deduction(expenses, income_2024_2m)
        # uncapped: 300000, aggregate: 100000 (под лимитом)
        # base = 300000 + 100000 = 400000
        # 400000 * 0.13 = 52000
        assert result.deduction_amount == Decimal("52000.00")
        assert result.uncapped_amount == Decimal("300000")
        assert result.limit_used == Decimal("100000")


class TestChildEducation:
    """Обучение детей — отдельный лимит на каждого ребёнка."""

    def test_under_child_limit_2024(self, income_2024_2m):
        expenses = [
            ExpenseItem(
                ExpenseCategory.EDUCATION_CHILD, Decimal("80000"), 2024,
                child_key="child_1",
            )
        ]
        result = calculate_deduction(expenses, income_2024_2m)
        # 80000 * 0.13 = 10400
        assert result.deduction_amount == Decimal("10400.00")
        assert len(result.per_child_details) == 1
        assert result.per_child_details[0].lost == Decimal("0")

    def test_over_child_limit_2024(self, income_2024_2m):
        expenses = [
            ExpenseItem(
                ExpenseCategory.EDUCATION_CHILD, Decimal("200000"), 2024,
                child_key="child_1",
            )
        ]
        result = calculate_deduction(expenses, income_2024_2m)
        # Лимит 110000 для 2024: 110000 * 0.13 = 14300
        assert result.deduction_amount == Decimal("14300.00")
        assert result.per_child_details[0].capped == Decimal("110000")
        assert result.per_child_details[0].lost == Decimal("90000")

    def test_child_limit_50k_for_2023(self):
        income = PersonIncome(Decimal("2000000"), 2023)
        expenses = [
            ExpenseItem(
                ExpenseCategory.EDUCATION_CHILD, Decimal("100000"), 2023,
                child_key="child_1",
            )
        ]
        result = calculate_deduction(expenses, income)
        # Лимит 50000 для 2023
        assert result.per_child_details[0].capped == Decimal("50000")

    def test_two_children_separate_limits(self, income_2024_2m):
        expenses = [
            ExpenseItem(
                ExpenseCategory.EDUCATION_CHILD, Decimal("110000"), 2024,
                child_key="child_1",
            ),
            ExpenseItem(
                ExpenseCategory.EDUCATION_CHILD, Decimal("110000"), 2024,
                child_key="child_2",
            ),
        ]
        result = calculate_deduction(expenses, income_2024_2m)
        # 2 * 110000 * 0.13 = 28600
        assert result.deduction_amount == Decimal("28600.00")
        assert len(result.per_child_details) == 2

    def test_child_education_does_not_eat_aggregate_limit(self, income_2024_2m):
        expenses = [
            ExpenseItem(
                ExpenseCategory.EDUCATION_CHILD, Decimal("110000"), 2024,
                child_key="child_1",
            ),
            ExpenseItem(ExpenseCategory.MEDICINE, Decimal("150000"), 2024),
        ]
        result = calculate_deduction(expenses, income_2024_2m)
        # child: 110000 + aggregate: 150000 = 260000
        # 260000 * 0.13 = 33800
        assert result.deduction_amount == Decimal("33800.00")
        assert result.limit_used == Decimal("150000")  # aggregate full


class TestAggregateMultipleCategories:
    """Совокупный лимит для нескольких категорий."""

    def test_medicine_plus_vhi_under_limit(self, income_2024_2m):
        expenses = [
            ExpenseItem(ExpenseCategory.MEDICINE, Decimal("50000"), 2024),
            ExpenseItem(ExpenseCategory.VHI, Decimal("30000"), 2024),
        ]
        result = calculate_deduction(expenses, income_2024_2m)
        # 80000 * 0.13 = 10400
        assert result.deduction_amount == Decimal("10400.00")
        assert result.limit_used == Decimal("80000")

    def test_all_aggregate_categories_share_limit(self, income_2024_2m):
        expenses = [
            ExpenseItem(ExpenseCategory.MEDICINE, Decimal("40000"), 2024),
            ExpenseItem(ExpenseCategory.VHI, Decimal("40000"), 2024),
            ExpenseItem(ExpenseCategory.EDUCATION_SELF, Decimal("40000"), 2024),
            ExpenseItem(ExpenseCategory.FITNESS, Decimal("40000"), 2024),
        ]
        result = calculate_deduction(expenses, income_2024_2m)
        # Total 160000, лимит 150000: 150000 * 0.13 = 19500
        assert result.deduction_amount == Decimal("19500.00")
        assert result.limit_used == Decimal("150000")


class TestEducationSpouse:
    """Обучение супруга — только с 2024 года."""

    def test_spouse_education_2024_ok(self, income_2024_2m):
        expenses = [
            ExpenseItem(ExpenseCategory.EDUCATION_SPOUSE, Decimal("50000"), 2024)
        ]
        result = calculate_deduction(expenses, income_2024_2m)
        assert result.deduction_amount == Decimal("6500.00")

    def test_spouse_education_2023_warning(self):
        income = PersonIncome(Decimal("2000000"), 2023)
        expenses = [
            ExpenseItem(ExpenseCategory.EDUCATION_SPOUSE, Decimal("50000"), 2023)
        ]
        result = calculate_deduction(expenses, income)
        assert result.deduction_amount == Decimal("0")
        assert any("супруга" in w for w in result.warnings)


class TestProgressiveRateIntegration:
    """Калькулятор с прогрессивной шкалой НДФЛ."""

    def test_higher_refund_with_higher_income_2025(self):
        expenses = [
            ExpenseItem(ExpenseCategory.MEDICINE, Decimal("150000"), 2025)
        ]
        # Доход 3M: маргинальная 15% → вычет 22500
        income_3m = PersonIncome(Decimal("3000000"), 2025)
        result = calculate_deduction(expenses, income_3m)
        assert result.deduction_amount == Decimal("22500.00")
        assert result.ndfl_rate == Decimal("0.15")

    def test_standard_refund_under_threshold_2025(self):
        expenses = [
            ExpenseItem(ExpenseCategory.MEDICINE, Decimal("150000"), 2025)
        ]
        # Доход 2M: ставка 13% → вычет 19500
        income_2m = PersonIncome(Decimal("2000000"), 2025)
        result = calculate_deduction(expenses, income_2m)
        assert result.deduction_amount == Decimal("19500.00")


class TestBreakdown:
    """Breakdown по категориям."""

    def test_breakdown_has_all_categories(self, income_2024_2m):
        expenses = [
            ExpenseItem(ExpenseCategory.MEDICINE, Decimal("30000"), 2024),
            ExpenseItem(ExpenseCategory.VHI, Decimal("20000"), 2024),
        ]
        result = calculate_deduction(expenses, income_2024_2m)
        assert len(result.breakdown) == 2
        categories = {b.category for b in result.breakdown}
        assert categories == {ExpenseCategory.MEDICINE, ExpenseCategory.VHI}


class TestEmptyExpenses:
    """Пустые или не совпадающие по году расходы."""

    def test_empty_list(self, income_2024_2m):
        result = calculate_deduction([], income_2024_2m)
        assert result.deduction_amount == Decimal("0")
        assert result.total_expenses == Decimal("0")

    def test_wrong_year_filtered(self, income_2024_2m):
        expenses = [
            ExpenseItem(ExpenseCategory.MEDICINE, Decimal("50000"), 2023)
        ]
        result = calculate_deduction(expenses, income_2024_2m)
        assert result.deduction_amount == Decimal("0")
