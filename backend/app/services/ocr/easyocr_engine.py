"""EasyOCR engine wrapper with singleton model and timeout support.

Loads the EasyOCR reader once at first use (singleton pattern).
Runs recognition in a ThreadPoolExecutor with a 120-second timeout (CPU).
Returns OCRResult with TextBlocks in unified format.
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError
from typing import TYPE_CHECKING

import cv2
import numpy as np

from app.services.ocr.ocr_result import OCRResult, TextBlock

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

_EASYOCR_TIMEOUT_SEC = 120  # CPU inference takes 30-90s without GPU
_EASYOCR_LANGUAGES = ["ru", "en"]
_MIN_BLOCKS_THRESHOLD = 5

# Singleton storage
_reader = None
_executor = ThreadPoolExecutor(max_workers=1)


def _get_reader():
    """Return singleton EasyOCR Reader, initialising it on first call."""
    global _reader  # noqa: PLW0603
    if _reader is None:
        try:
            import easyocr  # noqa: PLC0415

            _reader = easyocr.Reader(_EASYOCR_LANGUAGES, gpu=False)
            logger.info("EasyOCR reader initialised (languages=%s)", _EASYOCR_LANGUAGES)
        except Exception:
            logger.exception("Failed to initialise EasyOCR reader")
            raise
    return _reader


def _decode_image(image_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Cannot decode image bytes")
    return img


def _run_easyocr(image_bytes: bytes) -> list:
    """Blocking EasyOCR call executed inside the thread pool."""
    reader = _get_reader()
    img = _decode_image(image_bytes)
    results = reader.readtext(img, detail=1)
    return results


def _parse_results(raw: list) -> OCRResult:
    """Convert raw EasyOCR output to OCRResult."""
    blocks: list[TextBlock] = []
    for item in raw:
        # EasyOCR format: [bbox_points, text, confidence]
        bbox_points, text, conf = item
        # bbox_points: [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
        xs = [p[0] for p in bbox_points]
        ys = [p[1] for p in bbox_points]
        bbox = (min(xs), min(ys), max(xs), max(ys))
        if text.strip():
            blocks.append(TextBlock(text=text, confidence=float(conf), bbox=bbox))

    if blocks:
        avg_conf = sum(b.confidence for b in blocks) / len(blocks)
    else:
        avg_conf = 0.0

    return OCRResult(blocks=blocks, confidence=avg_conf, engine_used="easyocr")


class EasyOCREngine:
    """OCR engine backed by EasyOCR with timeout and singleton model."""

    def recognize(self, image_bytes: bytes) -> OCRResult:
        """Recognise text in *image_bytes* using EasyOCR.

        Times out after 120 seconds. Raises RuntimeError on timeout or failure.
        """
        future = _executor.submit(_run_easyocr, image_bytes)
        try:
            raw = future.result(timeout=_EASYOCR_TIMEOUT_SEC)
        except FuturesTimeoutError as exc:
            future.cancel()
            raise RuntimeError(
                f"EasyOCR timed out after {_EASYOCR_TIMEOUT_SEC}s"
            ) from exc
        except Exception as exc:
            raise RuntimeError(f"EasyOCR recognition failed: {exc}") from exc

        return _parse_results(raw)

    @property
    def min_blocks_threshold(self) -> int:
        return _MIN_BLOCKS_THRESHOLD
