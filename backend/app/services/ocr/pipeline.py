"""OCR Pipeline — OpenAI Vision + QR scan (B-07).

Replaces EasyOCR/Tesseract/PaddleOCR with GPT-4o Vision.
Pipeline:
  1. QR scan (parallel, local — fast fiscal data)
  2. OpenAI Vision -> structured JSON
  3. Merge: QR fiscal data overwrites/confirms AI fields
  4. Drug normalization via GRLS registry
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from app.services.ocr import openai_vision
from app.services.ocr.drug_normalizer import DrugMatch, get_drug_normalizer
from app.services.ocr.ocr_result import QRResult
from app.services.ocr.qr_scanner import scan_qr

logger = logging.getLogger(__name__)

_RECEIPT_MAX_AGE_DAYS = 365

CONFIDENCE_DONE = 0.85
CONFIDENCE_REVIEW = 0.20


@dataclass
class NormalizedItem:
    """Receipt line item after GRLS normalization."""

    drug_name_raw: str
    drug_inn: str | None
    is_rx: bool | None
    quantity: float | None
    unit_price: Decimal | None
    total_price: Decimal | None
    drug_match_score: float | None


@dataclass
class ParsedReceipt:
    """Full pipeline result for one receipt image."""

    strategy: str
    confidence: float
    purchase_date: date | None
    total_amount: Decimal | None
    pharmacy_name: str | None
    raw_text: str
    items: list[NormalizedItem] = field(default_factory=list)
    processing_time_ms: int = 0

    @property
    def ocr_status(self) -> str:
        if self.confidence >= CONFIDENCE_DONE:
            return "DONE"
        if self.confidence >= CONFIDENCE_REVIEW:
            return "REVIEW"
        return "FAILED"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_decimal(value: object) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except InvalidOperation:
        return None


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    for fmt in ("%d.%m.%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _is_too_old(qr: QRResult) -> bool:
    cutoff = datetime.now(UTC) - timedelta(days=_RECEIPT_MAX_AGE_DAYS)
    qr_dt = qr.date if qr.date.tzinfo else qr.date.replace(tzinfo=UTC)
    return qr_dt < cutoff


def _amounts_match(a: Decimal, b: Decimal) -> bool:
    if a == b:
        return True
    diff = abs(a - b)
    larger = max(abs(a), abs(b))
    if larger == 0:
        return True
    return (diff / larger) <= Decimal("0.02") or diff <= Decimal("5.00")


def _compute_confidence(ai_data: dict, qr: QRResult | None) -> tuple[float, str]:
    """Compute confidence score and strategy from AI output + QR result."""
    has_date = bool(ai_data.get("purchase_date"))
    has_amount = ai_data.get("total_amount") is not None
    has_pharmacy = bool(ai_data.get("pharmacy_name"))
    has_items = bool(ai_data.get("items"))

    if not any([has_date, has_amount, has_pharmacy, has_items]):
        return 0.0, "ai_failed"

    # Prescription path
    if ai_data.get("document_type") == "prescription":
        score = 0.70 if ai_data.get("drugs") else 0.40
        return score, "ai_prescription"

    # Weighted score: amount + date are most critical for tax deduction
    score = 0.0
    if has_date:
        score += 0.25
    if has_amount:
        score += 0.35
    if has_pharmacy:
        score += 0.15
    if has_items:
        score += 0.15

    strategy = "ai_only"
    if qr is not None:
        ai_amount = _to_decimal(ai_data.get("total_amount"))
        if ai_amount is not None and _amounts_match(qr.amount, ai_amount):
            score = min(1.0, score + 0.10)
            strategy = "ai_qr_confirmed"
        elif ai_amount is None:
            score = min(1.0, score + 0.05)
            strategy = "ai_qr_supplemented"
        else:
            score *= 0.65
            strategy = "ai_qr_conflict"

    return round(score, 4), strategy


def _normalize_items(raw_items: list[dict]) -> list[NormalizedItem]:
    """Match AI-extracted drug names against GRLS registry."""
    if not raw_items:
        return []
    normalizer = get_drug_normalizer()
    result: list[NormalizedItem] = []
    for item in raw_items:
        name = item.get("drug_name", "").strip()
        if not name:
            continue
        match: DrugMatch | None = normalizer.normalize(name)
        result.append(
            NormalizedItem(
                drug_name_raw=name,
                drug_inn=match.drug_inn if match else None,
                is_rx=match.is_rx if match else None,
                quantity=float(item["quantity"]) if item.get("quantity") is not None else 1.0,
                unit_price=_to_decimal(item.get("unit_price")),
                total_price=_to_decimal(item.get("total_price")),
                drug_match_score=match.match_score if match else None,
            )
        )
    return result


def _build_raw_text(ai_data: dict) -> str:
    """Build readable text summary from AI extracted fields (for logging/debug)."""
    parts: list[str] = []
    if ai_data.get("pharmacy_name"):
        parts.append(ai_data["pharmacy_name"])
    if ai_data.get("purchase_date"):
        parts.append(ai_data["purchase_date"])
    for item in (ai_data.get("items") or ai_data.get("drugs") or []):
        line = item.get("drug_name", "")
        price = item.get("total_price") or item.get("unit_price")
        if price:
            line += f" {price}"
        if line:
            parts.append(line)
    if ai_data.get("total_amount") is not None:
        parts.append(f"ИТОГО {ai_data['total_amount']}")
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def process_image(image_bytes: bytes) -> ParsedReceipt:
    """Main pipeline: image bytes -> ParsedReceipt.

    Runs QR scan and OpenAI Vision in parallel, then merges results.
    """
    t_start = time.perf_counter()
    loop = asyncio.get_running_loop()

    # Parallel: QR (local, fast) + OpenAI Vision (network)
    qr_task = loop.run_in_executor(None, scan_qr, image_bytes)
    ai_task = openai_vision.extract(image_bytes)

    qr_raw, ai_data = await asyncio.gather(qr_task, ai_task, return_exceptions=True)

    # Handle exceptions
    qr_result: QRResult | None = None
    if isinstance(qr_raw, Exception):
        logger.warning("pipeline: QR scan raised: %s", qr_raw)
    elif isinstance(qr_raw, QRResult):
        qr_result = qr_raw

    if isinstance(ai_data, Exception):
        logger.error("pipeline: OpenAI Vision raised: %s", ai_data)
        ai_data = {}

    # Drop stale QR data
    if qr_result is not None and _is_too_old(qr_result):
        logger.info("pipeline: QR > 12 months old, ignoring")
        qr_result = None

    confidence, strategy = _compute_confidence(ai_data, qr_result)

    # Build fields — AI is primary source; QR fills gaps
    purchase_date: date | None = _parse_date(ai_data.get("purchase_date"))
    total_amount: Decimal | None = _to_decimal(ai_data.get("total_amount"))
    pharmacy_name: str | None = ai_data.get("pharmacy_name") or None

    if qr_result is not None:
        if purchase_date is None:
            purchase_date = qr_result.date.date()
        if total_amount is None:
            total_amount = qr_result.amount

    raw_text = _build_raw_text(ai_data)

    # Drug normalization against GRLS (sync, run in thread)
    raw_items = ai_data.get("items") or ai_data.get("drugs") or []
    items = await loop.run_in_executor(None, _normalize_items, raw_items)

    total_ms = int((time.perf_counter() - t_start) * 1000)
    logger.info(
        "pipeline: done strategy=%s confidence=%.2f items=%d time=%dms",
        strategy, confidence, len(items), total_ms,
    )

    return ParsedReceipt(
        strategy=strategy,
        confidence=confidence,
        purchase_date=purchase_date,
        total_amount=total_amount,
        pharmacy_name=pharmacy_name,
        raw_text=raw_text,
        items=items,
        processing_time_ms=total_ms,
    )
