"""Shared OCR result types for EasyOCR, Tesseract engines and QR scanner."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal


@dataclass
class TextBlock:
    """Single recognized text block with confidence and bounding box."""

    text: str
    confidence: float
    bbox: tuple  # (x_min, y_min, x_max, y_max) or engine-native format


@dataclass
class OCRResult:
    """Unified OCR result returned by any engine."""

    blocks: list[TextBlock] = field(default_factory=list)
    confidence: float = 0.0
    engine_used: str = ""

    @property
    def full_text(self) -> str:
        """All recognized text joined with newlines."""
        return "\n".join(b.text for b in self.blocks if b.text.strip())


@dataclass
class QRResult:
    """Parsed fields from an FNS fiscal receipt QR code."""

    date: datetime
    amount: Decimal
    fn: str
    fd: str
    fp: str
    raw_url: str
