"""Result Merger — merges QR scan and OCR results into a single MergedReceipt.

Six merge strategies (B-05):
  merged              — amounts and dates agree → confidence 1.0
  merged_date_conflict — amounts agree, dates differ → confidence 0.92
  fns_only            — QR succeeded, OCR has no blocks → confidence 0.9
  ocr_only            — no QR → confidence from OCR engine
  conflict            — amounts disagree (>2% AND >5 rub) → confidence 0.5
  both_failed         — no QR and no OCR blocks → confidence 0.0

Amount comparison rule (from conflict definition):
  conflict  = diff > 2%  AND  diff > 5 rub
  match     = NOT conflict  =  diff ≤ 2%  OR  diff ≤ 5 rub
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation

from app.services.ocr.ocr_result import OCRResult, QRResult

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------

_MATCH_PCT = Decimal("0.02")   # 2 %
_MATCH_ABS = Decimal("5.00")   # 5 rub

# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------


@dataclass
class MergedReceipt:
    """Result of merging QR and OCR data for a single receipt."""

    strategy: str
    confidence: float
    purchase_date: date | None
    total_amount: Decimal | None
    pharmacy_name: str | None
    raw_text: str


# ---------------------------------------------------------------------------
# OCR text parsers
# ---------------------------------------------------------------------------

# Matches amounts like "1 248.50", "1248,50", "500.00"
_AMOUNT_RE = re.compile(r"(\d[\d\s]*[.,]\d{2})")
# Matches dates DD.MM.YYYY or DD/MM/YYYY
_DATE_RE = re.compile(r"(\d{2})[./](\d{2})[./](\d{4})")
# Keywords that precede the total line
_TOTAL_KW_RE = re.compile(r"итог[оа]?|total|сумма", re.IGNORECASE)
# Keywords that indicate a pharmacy
_PHARMACY_KW_RE = re.compile(r"аптека|apteka|pharmacy|фарм", re.IGNORECASE)


def _parse_amount(text: str) -> Decimal | None:
    """Extract first valid decimal amount from *text*."""
    m = _AMOUNT_RE.search(text)
    if m:
        raw = m.group(1).replace(" ", "").replace(",", ".")
        try:
            return Decimal(raw)
        except InvalidOperation:
            pass
    return None


def _extract_ocr_amount(ocr: OCRResult) -> Decimal | None:
    """Return total amount from OCR result.

    Priority: block that contains a total keyword → last numeric amount in text.
    """
    # 1. Look for a block with ИТОГО / total keyword
    for block in ocr.blocks:
        if _TOTAL_KW_RE.search(block.text):
            amt = _parse_amount(block.text)
            if amt is not None:
                return amt

    # 2. Fallback: last amount found anywhere
    last: Decimal | None = None
    for block in ocr.blocks:
        amt = _parse_amount(block.text)
        if amt is not None:
            last = amt
    return last


def _extract_ocr_date(ocr: OCRResult) -> date | None:
    """Return first parseable date from OCR blocks."""
    for block in ocr.blocks:
        m = _DATE_RE.search(block.text)
        if m:
            try:
                day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
                return date(year, month, day)
            except ValueError:
                pass
    return None


def _extract_pharmacy(ocr: OCRResult) -> str | None:
    """Return the first block that looks like a pharmacy name."""
    for block in ocr.blocks:
        if _PHARMACY_KW_RE.search(block.text):
            return block.text.strip()
    return None


# ---------------------------------------------------------------------------
# Amount comparison
# ---------------------------------------------------------------------------


def _amounts_match(a: Decimal, b: Decimal) -> bool:
    """Return True when amounts are close enough to be considered equal.

    Match when: diff ≤ 2%  OR  diff ≤ 5 rub  (inverse of conflict condition).
    """
    if a == b:
        return True
    diff = abs(a - b)
    larger = max(abs(a), abs(b))
    if larger == 0:
        return True
    pct = diff / larger
    return pct <= _MATCH_PCT or diff <= _MATCH_ABS


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def merge(qr: QRResult | None, ocr: OCRResult) -> MergedReceipt:
    """Merge *qr* and *ocr* into a :class:`MergedReceipt` using one of 6 strategies."""
    raw_text = ocr.full_text
    pharmacy = _extract_pharmacy(ocr)

    has_qr = qr is not None
    has_ocr = bool(ocr.blocks)

    # ---- both_failed -------------------------------------------------------
    if not has_qr and not has_ocr:
        return MergedReceipt(
            strategy="both_failed",
            confidence=0.0,
            purchase_date=None,
            total_amount=None,
            pharmacy_name=pharmacy,
            raw_text=raw_text,
        )

    # ---- ocr_only ----------------------------------------------------------
    if not has_qr:
        ocr_amount = _extract_ocr_amount(ocr)
        ocr_date = _extract_ocr_date(ocr)
        return MergedReceipt(
            strategy="ocr_only",
            confidence=ocr.confidence,
            purchase_date=ocr_date,
            total_amount=ocr_amount,
            pharmacy_name=pharmacy,
            raw_text=raw_text,
        )

    assert qr is not None  # for type checker

    # ---- fns_only ----------------------------------------------------------
    if not has_ocr:
        return MergedReceipt(
            strategy="fns_only",
            confidence=0.9,
            purchase_date=qr.date.date(),
            total_amount=qr.amount,
            pharmacy_name=pharmacy,
            raw_text=raw_text,
        )

    # ---- both have data — compare -----------------------------------------
    ocr_amount = _extract_ocr_amount(ocr)
    ocr_date = _extract_ocr_date(ocr)

    if ocr_amount is None:
        # OCR has blocks but no extractable amount — treat as fns_only
        logger.debug("merge: OCR blocks present but no amount extracted → fns_only")
        return MergedReceipt(
            strategy="fns_only",
            confidence=0.9,
            purchase_date=qr.date.date(),
            total_amount=qr.amount,
            pharmacy_name=pharmacy,
            raw_text=raw_text,
        )

    amounts_ok = _amounts_match(qr.amount, ocr_amount)

    if not amounts_ok:
        return MergedReceipt(
            strategy="conflict",
            confidence=0.5,
            purchase_date=qr.date.date(),
            total_amount=None,
            pharmacy_name=pharmacy,
            raw_text=raw_text,
        )

    # Amounts match — check dates
    dates_conflict = ocr_date is not None and ocr_date != qr.date.date()

    if dates_conflict:
        return MergedReceipt(
            strategy="merged_date_conflict",
            confidence=0.92,
            purchase_date=qr.date.date(),  # prefer QR date
            total_amount=qr.amount,
            pharmacy_name=pharmacy,
            raw_text=raw_text,
        )

    return MergedReceipt(
        strategy="merged",
        confidence=1.0,
        purchase_date=qr.date.date(),
        total_amount=qr.amount,
        pharmacy_name=pharmacy,
        raw_text=raw_text,
    )
