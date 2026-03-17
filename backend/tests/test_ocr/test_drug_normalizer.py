"""TDD tests for Drug Normalizer (B-06)."""
import time
from pathlib import Path

import pytest

from app.services.ocr.drug_normalizer import DrugMatch, DrugNormalizer

# Use the real GRLS file bundled with the project
GRLS_PATH = (
    Path(__file__).parent.parent.parent / "data" / "grls_drugs.json"
)


@pytest.fixture
def normalizer() -> DrugNormalizer:
    return DrugNormalizer(grls_path=GRLS_PATH)


# ---------------------------------------------------------------------------
# Basic normalization
# ---------------------------------------------------------------------------


def test_normalize_aspirin_returns_drug_match(normalizer):
    result = normalizer.normalize("Аспирин")
    assert result is not None
    assert isinstance(result, DrugMatch)
    assert "ацетилсалициловая" in result.drug_inn.lower()
    assert result.match_score >= 80


def test_normalize_nurofen_returns_ibuprofen(normalizer):
    result = normalizer.normalize("НУРОФЕН ЭКСПРЕСС")
    assert result is not None
    assert "ибупрофен" in result.drug_inn.lower()
    assert result.match_score >= 80


def test_normalize_garbage_returns_none(normalizer):
    result = normalizer.normalize("абракадабра123")
    assert result is None


def test_normalize_empty_string_returns_none(normalizer):
    result = normalizer.normalize("")
    assert result is None


def test_normalize_case_insensitive(normalizer):
    upper = normalizer.normalize("АСПИРИН")
    lower = normalizer.normalize("аспирин")
    assert upper is not None
    assert lower is not None
    assert upper.drug_inn == lower.drug_inn


# ---------------------------------------------------------------------------
# DrugMatch fields
# ---------------------------------------------------------------------------


def test_drug_match_has_is_rx_flag(normalizer):
    # Амоксициллин — рецептурный
    result = normalizer.normalize("Флемоксин")
    assert result is not None
    assert result.is_rx is True


def test_drug_match_otc_drug(normalizer):
    # Парацетамол — безрецептурный
    result = normalizer.normalize("Панадол")
    assert result is not None
    assert result.is_rx is False


def test_drug_match_has_display_name(normalizer):
    result = normalizer.normalize("Аспирин")
    assert result is not None
    assert result.display_name  # non-empty


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------


def test_cache_returns_same_object(normalizer):
    result1 = normalizer.normalize("Аспирин")
    result2 = normalizer.normalize("Аспирин")
    assert result1 is result2  # same object from cache


def test_normalize_1000_calls_under_one_second(normalizer):
    # Warm cache first
    normalizer.normalize("Аспирин")
    start = time.perf_counter()
    for _ in range(1000):
        normalizer.normalize("Аспирин")
    elapsed = time.perf_counter() - start
    assert elapsed < 1.0, f"1000 cached calls took {elapsed:.2f}s"


# ---------------------------------------------------------------------------
# Batch normalization
# ---------------------------------------------------------------------------


def test_normalize_receipt_items_returns_list(normalizer):
    items = ["Аспирин", "Нурофен", "абракадабра123"]
    results = normalizer.normalize_receipt_items(items)
    assert len(results) == 3
    assert results[0] is not None
    assert results[1] is not None
    assert results[2] is None


def test_normalize_receipt_items_empty_list(normalizer):
    assert normalizer.normalize_receipt_items([]) == []
