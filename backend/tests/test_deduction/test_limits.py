"""Тесты лимитов по годам."""

from decimal import Decimal

import pytest

from app.services.deduction.limits import get_aggregate_limit, get_child_education_limit


class TestAggregateLimits:
    def test_2023_is_120k(self):
        assert get_aggregate_limit(2023) == Decimal("120000")

    def test_2024_is_150k(self):
        assert get_aggregate_limit(2024) == Decimal("150000")

    def test_2025_is_150k(self):
        assert get_aggregate_limit(2025) == Decimal("150000")

    def test_2020_is_120k(self):
        assert get_aggregate_limit(2020) == Decimal("120000")


class TestChildEducationLimits:
    def test_2023_is_50k(self):
        assert get_child_education_limit(2023) == Decimal("50000")

    def test_2024_is_110k(self):
        assert get_child_education_limit(2024) == Decimal("110000")

    def test_2025_is_110k(self):
        assert get_child_education_limit(2025) == Decimal("110000")
