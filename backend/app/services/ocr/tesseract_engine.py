"""Tesseract OCR engine wrapper.

Uses pytesseract with psm 6 (uniform block of text) as primary mode.
Falls back to psm 4 (single column) when fewer than 5 text blocks are found.
Returns OCRResult with TextBlocks in unified format.
"""
from __future__ import annotations

import logging

import cv2
import numpy as np

from app.services.ocr.ocr_result import OCRResult, TextBlock

logger = logging.getLogger(__name__)

_LANG = "rus+eng"
_PSM_PRIMARY = 6
_PSM_FALLBACK = 4
_MIN_BLOCKS_FOR_PRIMARY = 5
_MIN_CONFIDENCE = 0  # include all blocks; caller can filter


def _decode_image(image_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Cannot decode image bytes")
    return img


def _run_tesseract(img: np.ndarray, psm: int) -> list[TextBlock]:
    """Run tesseract on *img* with given page-segmentation mode."""
    import pytesseract  # noqa: PLC0415 — lazy import to allow mocking in tests

    config = f"--oem 3 --psm {psm}"
    data = pytesseract.image_to_data(
        img,
        lang=_LANG,
        config=config,
        output_type=pytesseract.Output.DICT,
    )

    blocks: list[TextBlock] = []
    n = len(data["text"])
    for i in range(n):
        text = (data["text"][i] or "").strip()
        raw_conf = data["conf"][i]
        if not text:
            continue
        try:
            conf = float(raw_conf) / 100.0
        except (ValueError, TypeError):
            conf = 0.0
        if conf < 0:
            # Tesseract uses -1 for non-text regions
            continue
        x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
        bbox = (x, y, x + w, y + h)
        blocks.append(TextBlock(text=text, confidence=conf, bbox=bbox))

    return blocks


def _blocks_to_result(blocks: list[TextBlock], psm_used: int) -> OCRResult:
    avg_conf = sum(b.confidence for b in blocks) / len(blocks) if blocks else 0.0
    return OCRResult(
        blocks=blocks,
        confidence=avg_conf,
        engine_used=f"tesseract_psm{psm_used}",
    )


class TesseractEngine:
    """OCR engine backed by Tesseract.

    Tries psm 6 first. If fewer than 5 blocks are detected, retries with psm 4.
    """

    def recognize(self, image_bytes: bytes) -> OCRResult:
        """Recognise text in *image_bytes* using Tesseract.

        Raises RuntimeError on decode or Tesseract failure.
        """
        try:
            img = _decode_image(image_bytes)
        except Exception as exc:
            raise RuntimeError(f"Cannot decode image for Tesseract: {exc}") from exc

        try:
            blocks = _run_tesseract(img, psm=_PSM_PRIMARY)
        except Exception as exc:
            raise RuntimeError(f"Tesseract (psm {_PSM_PRIMARY}) failed: {exc}") from exc

        if len(blocks) < _MIN_BLOCKS_FOR_PRIMARY:
            logger.debug(
                "Tesseract psm%d returned %d blocks (<5), retrying with psm%d",
                _PSM_PRIMARY,
                len(blocks),
                _PSM_FALLBACK,
            )
            try:
                blocks = _run_tesseract(img, psm=_PSM_FALLBACK)
                return _blocks_to_result(blocks, _PSM_FALLBACK)
            except Exception:
                logger.warning("Tesseract psm%d also failed, using psm%d result", _PSM_FALLBACK, _PSM_PRIMARY)

        return _blocks_to_result(blocks, _PSM_PRIMARY)
