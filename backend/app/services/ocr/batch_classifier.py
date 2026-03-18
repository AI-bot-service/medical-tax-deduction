"""Batch Classifier (B-09).

5-step algorithm to classify an image as receipt / prescription / unknown.
Uses only Tesseract PSM-6 on first 10 lines (~0.3 sec).

Steps:
  1. QR decode → fn/i/fp params → receipt, confidence=1.0
  2. Tesseract keywords: ФИСКАЛЬНЫЙ/ФН/ФД/ФП/АПТЕКА/ИТОГО ≥3 → receipt, 0.85
  3. Tesseract keywords: Rp./Рецепт/107-1у/МНН/Дозировка/Врач ≥2 → prescription, 0.85
  4. Tesseract keywords: ВЫПИСКА/МЕДИЦИНСКАЯ КАРТА/003у/025у/ДИАГНОЗ ≥2 → prescription, 0.80
  5. unknown, confidence=0.0
"""
from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Optional heavy deps — imported at module level; tests can mock via patch()
try:
    import numpy as np
    _HAS_NUMPY = True
except ImportError:  # pragma: no cover
    np = None  # type: ignore[assignment]
    _HAS_NUMPY = False

try:
    from PIL import Image
    _HAS_PIL = True
except ImportError:  # pragma: no cover
    Image = None  # type: ignore[assignment]
    _HAS_PIL = False

try:
    import pytesseract
    _HAS_TESSERACT = True
except ImportError:  # pragma: no cover
    pytesseract = None  # type: ignore[assignment]
    _HAS_TESSERACT = False

try:
    from pyzbar.pyzbar import decode as pyzbar_decode
    _HAS_PYZBAR = True
except ImportError:  # pragma: no cover
    pyzbar_decode = None  # type: ignore[assignment]
    _HAS_PYZBAR = False


# ── keyword sets ──────────────────────────────────────────────────────────────

_RECEIPT_KEYWORDS = {
    "ФИСКАЛЬНЫЙ", "ФН", "ФД", "ФП", "АПТЕКА", "ИТОГО",
    "КАССОВЫЙ", "ЧЕКOPC", "ОФД", "СМЕНА",
}

_PRESCRIPTION_KEYWORDS_A = {
    "RP", "RП", "РЕЦЕПТ", "107-1", "МНН", "ДОЗИРОВКА", "ВРАЧ",
    "РЕЦЕПТУРНЫЙ", "ОТПУСТИТЬ",
}

_PRESCRIPTION_KEYWORDS_B = {
    "ВЫПИСКА", "МЕДИЦИНСКАЯ", "КАРТА", "003", "025", "ДИАГНОЗ",
    "ИСТОРИЯ", "БОЛЕЗНИ", "СТАЦИОНАР",
}

# QR payload pattern for FNS fiscal receipts
_FNS_QR_PATTERN = re.compile(r"fn=\d+", re.IGNORECASE)


@dataclass
class ClassificationResult:
    classified_as: str          # "receipt" | "prescription" | "unknown"
    confidence: float           # 0.0..1.0
    keywords_found: list[str] = field(default_factory=list)
    recommended_doc_type: str | None = None


def classify(image_bytes: bytes) -> ClassificationResult:
    """Classify image as receipt / prescription / unknown.

    Args:
        image_bytes: raw image bytes (JPEG, PNG, etc.)

    Returns:
        ClassificationResult
    """
    # ── Step 1: QR decode ─────────────────────────────────────────────────────
    try:
        qr_result = _try_qr_decode(image_bytes)
        if qr_result is not None:
            return ClassificationResult(
                classified_as="receipt",
                confidence=1.0,
                keywords_found=["QR:FNS"],
            )
    except Exception as exc:
        logger.debug("B-09 Step 1 error: %s", exc)

    # ── Steps 2-4: Tesseract OCR on first lines ───────────────────────────────
    text_upper = _ocr_first_lines(image_bytes, n_lines=10)
    tokens = set(re.findall(r"[А-ЯA-Z0-9][А-ЯA-Z0-9\-/]*", text_upper))

    # Step 2: receipt keywords (≥3 matches)
    found_receipt = [kw for kw in _RECEIPT_KEYWORDS if kw in tokens]
    if len(found_receipt) >= 3:
        return ClassificationResult(
            classified_as="receipt",
            confidence=0.85,
            keywords_found=found_receipt,
        )

    # Step 3: prescription keywords set A (≥2 matches)
    found_rx_a = [kw for kw in _PRESCRIPTION_KEYWORDS_A if kw in tokens]
    if len(found_rx_a) >= 2:
        return ClassificationResult(
            classified_as="prescription",
            confidence=0.85,
            keywords_found=found_rx_a,
            recommended_doc_type="recipe_107",
        )

    # Step 4: prescription keywords set B (≥2 matches)
    found_rx_b = [kw for kw in _PRESCRIPTION_KEYWORDS_B if kw in tokens]
    if len(found_rx_b) >= 2:
        return ClassificationResult(
            classified_as="prescription",
            confidence=0.80,
            keywords_found=found_rx_b,
            recommended_doc_type="doc_025",
        )

    # Step 5: unknown
    return ClassificationResult(
        classified_as="unknown",
        confidence=0.0,
        keywords_found=found_receipt + found_rx_a + found_rx_b,
    )


def _try_qr_decode(image_bytes: bytes) -> str | None:
    """Return QR payload if FNS fiscal QR found, else None."""
    if not (_HAS_PIL and _HAS_NUMPY and _HAS_PYZBAR):
        return None

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_np = np.array(img)
    codes = pyzbar_decode(img_np)
    for code in codes:
        payload = code.data.decode("utf-8", errors="ignore")
        if _FNS_QR_PATTERN.search(payload):
            return payload
    return None


def _ocr_first_lines(image_bytes: bytes, n_lines: int = 10) -> str:
    """Run Tesseract PSM-6 and return first n_lines as uppercase string."""
    if not (_HAS_PIL and _HAS_TESSERACT):
        return ""

    try:
        img = Image.open(io.BytesIO(image_bytes))
        text = pytesseract.image_to_string(
            img,
            lang="rus+eng",
            config="--psm 6 --oem 1",
        )
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        return " ".join(lines[:n_lines]).upper()
    except Exception as exc:
        logger.debug("B-09 Tesseract error: %s", exc)
        return ""
