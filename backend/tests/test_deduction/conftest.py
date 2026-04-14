"""Фикстуры для тестов движка расчёта вычета."""

from decimal import Decimal

import pytest

from app.services.deduction.types import (
    ExpenseCategory,
    ExpenseItem,
    PersonIncome,
)


@pytest.fixture
def income_2024_2m():
    """Доход 2M, 2024 год — плоская ставка 13%."""
    return PersonIncome(annual_income=Decimal("2000000"), tax_year=2024)


@pytest.fixture
def income_2025_2m():
    """Доход 2M, 2025 год — ставка 13% (до порога 2.4M)."""
    return PersonIncome(annual_income=Decimal("2000000"), tax_year=2025)


@pytest.fixture
def income_2025_3m():
    """Доход 3M, 2025 год — маргинальная ставка 15%."""
    return PersonIncome(annual_income=Decimal("3000000"), tax_year=2025)


@pytest.fixture
def income_2025_10m():
    """Доход 10M, 2025 год — маргинальная ставка 18%."""
    return PersonIncome(annual_income=Decimal("10000000"), tax_year=2025)


@pytest.fixture
def medicine_50k():
    return ExpenseItem(
        category=ExpenseCategory.MEDICINE,
        amount=Decimal("50000"),
        tax_year=2024,
    )


@pytest.fixture
def medicine_200k():
    return ExpenseItem(
        category=ExpenseCategory.MEDICINE,
        amount=Decimal("200000"),
        tax_year=2024,
    )


@pytest.fixture
def expensive_treatment_500k():
    return ExpenseItem(
        category=ExpenseCategory.TREATMENT_EXPENSIVE,
        amount=Decimal("500000"),
        tax_year=2024,
    )


@pytest.fixture
def child_education_200k():
    return ExpenseItem(
        category=ExpenseCategory.EDUCATION_CHILD,
        amount=Decimal("200000"),
        tax_year=2024,
        child_key="child_1",
    )
