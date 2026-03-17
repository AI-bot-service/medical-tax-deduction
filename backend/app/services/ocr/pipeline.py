"""OCR Pipeline Orchestrator: параллельный QR + EasyOCR + merge + normalize (B-07)."""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from app.services.ocr.drug_normalizer import DrugMatch, get_drug_normalizer
from app.services.ocr.easyocr_engine import EasyOCREngine
from app.services.ocr.image_preprocessor import preprocess
from app.services.ocr.ocr_result import OCRResult, QRResult, TextBlock
from app.services.ocr.qr_scanner import scan_qr
from app.services.ocr.result_merger import MergedReceipt, merge
from app.services.ocr.tesseract_engine import TesseractEngine

logger = logging.getLogger(__name__)

_RECEIPT_MAX_AGE_DAYS = 365  # 12 месяцев — QR старше этого срока пропускается
_OCR_MIN_BLOCKS = 5  # если EasyOCR вернул < 5 блоков — используем Tesseract

# Thresholds для итогового статуса
CONFIDENCE_DONE = 0.85
CONFIDENCE_REVIEW = 0.60


@dataclass
class NormalizedItem:
    """Позиция чека после нормализации через DrugNormalizer."""

    drug_name_raw: str
    drug_inn: str | None
    is_rx: bool | None
    quantity: float | None
    unit_price: Decimal | None
    total_price: Decimal | None
    drug_match_score: float | None


@dataclass
class ParsedReceipt:
    """Полный результат OCR-пайплайна для одного чека."""

    # От MergedReceipt
    strategy: str
    confidence: float
    purchase_date: date | None
    total_amount: Decimal | None
    pharmacy_name: str | None
    raw_text: str

    # Нормализованные позиции
    items: list[NormalizedItem] = field(default_factory=list)

    # Метрики
    processing_time_ms: int = 0

    @property
    def ocr_status(self) -> str:
        """DONE / REVIEW / FAILED по порогам confidence."""
        if self.confidence >= CONFIDENCE_DONE:
            return "DONE"
        if self.confidence >= CONFIDENCE_REVIEW:
            return "REVIEW"
        return "FAILED"


def _is_receipt_too_old(qr: QRResult) -> bool:
    """True если дата QR-кода старше 12 месяцев."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=_RECEIPT_MAX_AGE_DAYS)
    qr_dt = qr.date if qr.date.tzinfo else qr.date.replace(tzinfo=timezone.utc)
    return qr_dt < cutoff


def _extract_items_from_text(raw_text: str) -> list[str]:
    """Грубый экстрактор строк-позиций из текста чека.

    Логика простая: строки, не являющиеся заголовком/итогом/датой,
    считаются кандидатами на позицию. Нормализатор отсеет нераспознанные.
    """
    lines = raw_text.splitlines()
    candidates = []
    skip_keywords = {
        "итого", "total", "сумма", "чек", "кассир", "спасибо",
        "аптека", "apteka", "нал", "безнал", "руб", "rub",
    }
    for line in lines:
        stripped = line.strip()
        if not stripped or len(stripped) < 4:
            continue
        lower = stripped.lower()
        if any(kw in lower for kw in skip_keywords):
            continue
        # Строки, содержащие только цифры и знаки — это суммы/даты, пропускаем
        alpha_count = sum(1 for c in stripped if c.isalpha())
        if alpha_count < 3:
            continue
        candidates.append(stripped)
    return candidates


def _build_normalized_items(
    raw_text: str,
) -> list[NormalizedItem]:
    """Извлекает и нормализует позиции из raw_text."""
    normalizer = get_drug_normalizer()
    candidates = _extract_items_from_text(raw_text)
    items: list[NormalizedItem] = []
    for candidate in candidates:
        match: DrugMatch | None = normalizer.normalize(candidate)
        items.append(
            NormalizedItem(
                drug_name_raw=candidate,
                drug_inn=match.drug_inn if match else None,
                is_rx=match.is_rx if match else None,
                quantity=None,  # требует структурированного парсинга позиций
                unit_price=None,
                total_price=None,
                drug_match_score=match.match_score if match else None,
            )
        )
    return items


async def process_image(image_bytes: bytes) -> ParsedReceipt:
    """Основной entry point пайплайна: изображение → ParsedReceipt.

    Шаги:
    1. Preprocessing (sync, в executor)
    2. QR decode (sync, в executor) параллельно с EasyOCR (thread executor)
    3. ReceiptAgeEstimator: пропустить QR если > 12 мес
    4. ResultMerger → MergedReceipt
    5. DrugNormalizer → items
    """
    t_start = time.perf_counter()
    loop = asyncio.get_running_loop()

    # --- Шаг 1: preprocessing ---
    t0 = time.perf_counter()
    preprocessed = await loop.run_in_executor(None, preprocess, image_bytes)
    logger.debug("pipeline: preprocess %.0fms", (time.perf_counter() - t0) * 1000)

    # --- Шаг 2: параллельный QR + EasyOCR ---
    t0 = time.perf_counter()
    qr_future = loop.run_in_executor(None, scan_qr, preprocessed)
    ocr_future = _run_easyocr(loop, preprocessed)

    qr_result: QRResult | None
    ocr_result: OCRResult
    qr_result, ocr_result = await asyncio.gather(qr_future, ocr_future)

    logger.debug("pipeline: qr+ocr %.0fms", (time.perf_counter() - t0) * 1000)

    # --- Шаг 3: ReceiptAgeEstimator ---
    if qr_result is not None and _is_receipt_too_old(qr_result):
        logger.info("pipeline: QR receipt > 12 months old, ignoring QR")
        qr_result = None

    # --- Шаг 4: merge ---
    t0 = time.perf_counter()
    merged: MergedReceipt = merge(qr_result, ocr_result)
    logger.debug("pipeline: merge %.0fms", (time.perf_counter() - t0) * 1000)

    # --- Шаг 5: normalize items ---
    t0 = time.perf_counter()
    items = _build_normalized_items(merged.raw_text)
    logger.debug("pipeline: normalize %.0fms", (time.perf_counter() - t0) * 1000)

    total_ms = int((time.perf_counter() - t_start) * 1000)
    logger.info(
        "pipeline: done strategy=%s confidence=%.2f items=%d time=%dms",
        merged.strategy,
        merged.confidence,
        len(items),
        total_ms,
    )

    return ParsedReceipt(
        strategy=merged.strategy,
        confidence=merged.confidence,
        purchase_date=merged.purchase_date,
        total_amount=merged.total_amount,
        pharmacy_name=merged.pharmacy_name,
        raw_text=merged.raw_text,
        items=items,
        processing_time_ms=total_ms,
    )


async def _run_easyocr(loop: asyncio.AbstractEventLoop, image_bytes: bytes) -> OCRResult:
    """Запускает EasyOCR; при < 5 блоков — Tesseract fallback."""
    engine = EasyOCREngine()
    try:
        result: OCRResult = await loop.run_in_executor(None, engine.recognize, image_bytes)
        if len(result.blocks) >= _OCR_MIN_BLOCKS:
            return result
        logger.info("pipeline: EasyOCR returned %d blocks, falling back to Tesseract", len(result.blocks))
    except Exception as exc:
        logger.warning("pipeline: EasyOCR failed (%s), falling back to Tesseract", exc)

    try:
        tesseract = TesseractEngine()
        return await loop.run_in_executor(None, tesseract.recognize, image_bytes)
    except Exception as exc:
        logger.error("pipeline: Tesseract also failed: %s", exc)
        return OCRResult(blocks=[], confidence=0.0, engine_used="none")
