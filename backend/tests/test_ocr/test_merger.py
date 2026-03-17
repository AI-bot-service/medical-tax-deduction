"""Tests for result_merger — 6 strategy coverage (B-05).

Strategies under test:
  merged              — amounts match, dates match → confidence 1.0
  merged_date_conflict — amounts match, dates differ → confidence 0.92
  fns_only            — QR ok, OCR empty → confidence from QR path (≥0.85)
  ocr_only            — no QR → confidence from OCR
  conflict            — amounts diverge (>2% AND >5 rub) → confidence ≤ 0.75
  both_failed         — QR=None, OCR empty → confidence 0.0
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

import pytest

from app.services.ocr.ocr_result import OCRResult, QRResult, TextBlock
from app.services.ocr.result_merger import MergedReceipt, merge


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_qr(amount: str, date_str: str = "2024-01-15") -> QRResult:
    """Construct a minimal QRResult for testing."""
    return QRResult(
        date=datetime.strptime(date_str, "%Y-%m-%d"),
        amount=Decimal(amount),
        fn="1234567890",
        fd="12345",
        fp="987654321",
        raw_url=f"t={date_str.replace('-', '')}T1200&s={amount}&fn=1234567890&i=12345&fp=987654321",
    )


def _make_ocr(
    total: str | None = None,
    date_str: str | None = None,
    pharmacy: str | None = None,
    confidence: float = 0.88,
) -> OCRResult:
    """Construct an OCRResult with optional total/date/pharmacy text blocks."""
    blocks: list[TextBlock] = []
    if pharmacy:
        blocks.append(TextBlock(text=pharmacy, confidence=0.9, bbox=(0, 0, 100, 20)))
    if date_str:
        blocks.append(TextBlock(text=f"Дата: {date_str}", confidence=0.85, bbox=(0, 20, 100, 40)))
    if total:
        blocks.append(TextBlock(text=f"ИТОГО {total}", confidence=0.88, bbox=(0, 40, 100, 60)))
    eff_confidence = confidence if blocks else 0.0
    return OCRResult(blocks=blocks, confidence=eff_confidence, engine_used="tesseract")


# ---------------------------------------------------------------------------
# MergedReceipt dataclass contract
# ---------------------------------------------------------------------------


class TestMergedReceiptContract:
    def test_is_dataclass_with_required_fields(self) -> None:
        qr = _make_qr("100.00")
        ocr = _make_ocr(total="100.00", date_str="15.01.2024")
        result = merge(qr, ocr)
        assert isinstance(result, MergedReceipt)
        assert hasattr(result, "strategy")
        assert hasattr(result, "confidence")
        assert hasattr(result, "purchase_date")
        assert hasattr(result, "total_amount")
        assert hasattr(result, "pharmacy_name")
        assert hasattr(result, "raw_text")

    def test_raw_text_contains_ocr_content(self) -> None:
        ocr = _make_ocr(total="500.00", date_str="10.02.2024", pharmacy="АПТЕКА Здоровье")
        result = merge(None, ocr)
        assert "ИТОГО" in result.raw_text or "Дата" in result.raw_text


# ---------------------------------------------------------------------------
# Strategy: merged
# ---------------------------------------------------------------------------


class TestStrategyMerged:
    def test_merged_when_amounts_and_dates_match(self) -> None:
        # diff = 1.50 rub ≤ 5 rub  → amounts match
        qr = _make_qr("1250.00", "2024-01-15")
        ocr = _make_ocr(total="1248.50", date_str="15.01.2024")

        result = merge(qr, ocr)

        assert result.strategy == "merged"
        assert result.confidence == 1.0

    def test_merged_uses_qr_amount(self) -> None:
        qr = _make_qr("1250.00", "2024-01-15")
        ocr = _make_ocr(total="1248.50", date_str="15.01.2024")

        result = merge(qr, ocr)

        assert result.total_amount == Decimal("1250.00")

    def test_merged_uses_qr_date(self) -> None:
        qr = _make_qr("1250.00", "2024-01-15")
        ocr = _make_ocr(total="1248.50", date_str="15.01.2024")

        result = merge(qr, ocr)

        assert result.purchase_date == date(2024, 1, 15)

    def test_merged_when_amounts_identical(self) -> None:
        qr = _make_qr("500.00", "2024-03-20")
        ocr = _make_ocr(total="500.00", date_str="20.03.2024")

        result = merge(qr, ocr)

        assert result.strategy == "merged"
        assert result.confidence == 1.0


# ---------------------------------------------------------------------------
# Strategy: merged_date_conflict
# ---------------------------------------------------------------------------


class TestStrategyMergedDateConflict:
    def test_merged_date_conflict_when_amounts_match_dates_differ(self) -> None:
        qr = _make_qr("1250.00", "2024-01-15")
        ocr = _make_ocr(total="1248.50", date_str="16.01.2024")  # day differs

        result = merge(qr, ocr)

        assert result.strategy == "merged_date_conflict"
        assert result.confidence == 0.92

    def test_merged_date_conflict_uses_qr_amount(self) -> None:
        qr = _make_qr("1250.00", "2024-01-15")
        ocr = _make_ocr(total="1248.50", date_str="16.01.2024")

        result = merge(qr, ocr)

        assert result.total_amount == Decimal("1250.00")


# ---------------------------------------------------------------------------
# Strategy: fns_only
# ---------------------------------------------------------------------------


class TestStrategyFnsOnly:
    def test_fns_only_when_qr_succeeds_ocr_empty(self) -> None:
        qr = _make_qr("850.00", "2024-02-10")
        ocr = OCRResult(blocks=[], confidence=0.0, engine_used="easyocr")

        result = merge(qr, ocr)

        assert result.strategy == "fns_only"

    def test_fns_only_uses_qr_amount(self) -> None:
        qr = _make_qr("850.00", "2024-02-10")
        ocr = OCRResult(blocks=[], confidence=0.0, engine_used="easyocr")

        result = merge(qr, ocr)

        assert result.total_amount == Decimal("850.00")

    def test_fns_only_uses_qr_date(self) -> None:
        qr = _make_qr("850.00", "2024-02-10")
        ocr = OCRResult(blocks=[], confidence=0.0, engine_used="easyocr")

        result = merge(qr, ocr)

        assert result.purchase_date == date(2024, 2, 10)

    def test_fns_only_confidence_is_high(self) -> None:
        qr = _make_qr("850.00", "2024-02-10")
        ocr = OCRResult(blocks=[], confidence=0.0, engine_used="easyocr")

        result = merge(qr, ocr)

        assert result.confidence >= 0.85


# ---------------------------------------------------------------------------
# Strategy: ocr_only
# ---------------------------------------------------------------------------


class TestStrategyOcrOnly:
    def test_ocr_only_when_no_qr(self) -> None:
        ocr = _make_ocr(total="500.00", date_str="20.03.2024")

        result = merge(None, ocr)

        assert result.strategy == "ocr_only"

    def test_ocr_only_confidence_equals_ocr_confidence(self) -> None:
        ocr = _make_ocr(total="500.00", date_str="20.03.2024", confidence=0.82)

        result = merge(None, ocr)

        assert result.confidence == 0.82

    def test_ocr_only_extracts_amount(self) -> None:
        ocr = _make_ocr(total="500.00", date_str="20.03.2024")

        result = merge(None, ocr)

        assert result.total_amount == Decimal("500.00")

    def test_ocr_only_extracts_date(self) -> None:
        ocr = _make_ocr(total="500.00", date_str="20.03.2024")

        result = merge(None, ocr)

        assert result.purchase_date == date(2024, 3, 20)


# ---------------------------------------------------------------------------
# Strategy: conflict
# ---------------------------------------------------------------------------


class TestStrategyConflict:
    def test_conflict_when_amounts_diverge(self) -> None:
        # diff=360 rub >5, 360/1250=28.8% >2% → conflict
        qr = _make_qr("1250.00", "2024-01-15")
        ocr = _make_ocr(total="890.00", date_str="15.01.2024")

        result = merge(qr, ocr)

        assert result.strategy == "conflict"

    def test_conflict_confidence_at_most_075(self) -> None:
        qr = _make_qr("1250.00", "2024-01-15")
        ocr = _make_ocr(total="890.00", date_str="15.01.2024")

        result = merge(qr, ocr)

        assert result.confidence <= 0.75

    def test_conflict_total_amount_is_none(self) -> None:
        """When amounts conflict, we cannot reliably pick one."""
        qr = _make_qr("1250.00", "2024-01-15")
        ocr = _make_ocr(total="890.00", date_str="15.01.2024")

        result = merge(qr, ocr)

        assert result.total_amount is None


# ---------------------------------------------------------------------------
# Strategy: both_failed
# ---------------------------------------------------------------------------


class TestStrategyBothFailed:
    def test_both_failed_when_qr_none_and_ocr_empty(self) -> None:
        ocr = OCRResult(blocks=[], confidence=0.0, engine_used="")

        result = merge(None, ocr)

        assert result.strategy == "both_failed"

    def test_both_failed_confidence_is_zero(self) -> None:
        ocr = OCRResult(blocks=[], confidence=0.0, engine_used="")

        result = merge(None, ocr)

        assert result.confidence == 0.0

    def test_both_failed_total_amount_is_none(self) -> None:
        ocr = OCRResult(blocks=[], confidence=0.0, engine_used="")

        result = merge(None, ocr)

        assert result.total_amount is None


# ---------------------------------------------------------------------------
# Pharmacy extraction
# ---------------------------------------------------------------------------


class TestPharmacyExtraction:
    def test_pharmacy_name_extracted_from_ocr(self) -> None:
        ocr = _make_ocr(
            total="300.00",
            date_str="10.01.2024",
            pharmacy="АПТЕКА Здоровье",
        )

        result = merge(None, ocr)

        assert result.pharmacy_name == "АПТЕКА Здоровье"

    def test_pharmacy_name_none_when_not_present(self) -> None:
        ocr = _make_ocr(total="300.00", date_str="10.01.2024")

        result = merge(None, ocr)

        assert result.pharmacy_name is None
