"""Tests for QR scanner — pyzbar-based decoder with 5 fallback strategies."""
from __future__ import annotations

import io
from datetime import datetime
from decimal import Decimal

import numpy as np
import pytest
import qrcode
from PIL import Image

from app.services.ocr.qr_scanner import QRResult, scan_qr


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

FNS_URL = (
    "t=20231215T1430&s=1250.00&fn=1234567890123456"
    "&i=12345&fp=987654321"
)


def _make_qr_image(data: str, *, rotate: int = 0) -> bytes:
    """Generate a PNG with a QR code containing *data*, optionally rotated."""
    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img: Image.Image = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    if rotate:
        img = img.rotate(rotate, expand=True)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_blank_image() -> bytes:
    """Generate a plain white image with no QR code."""
    img = Image.fromarray(np.ones((200, 200, 3), dtype=np.uint8) * 255)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_scan_qr_returns_qr_result_for_valid_fns_code() -> None:
    """scan_qr parses all FNS fields from a standard QR code."""
    image_bytes = _make_qr_image(FNS_URL)

    result = scan_qr(image_bytes)

    assert result is not None
    assert isinstance(result, QRResult)
    assert result.fn == "1234567890123456"
    assert result.fd == "12345"
    assert result.fp == "987654321"
    assert result.amount == Decimal("1250.00")
    assert result.date == datetime(2023, 12, 15, 14, 30)
    assert FNS_URL in result.raw_url or result.raw_url == FNS_URL


def test_scan_qr_returns_none_for_blank_image() -> None:
    """scan_qr returns None when no QR code is present."""
    image_bytes = _make_blank_image()

    result = scan_qr(image_bytes)

    assert result is None


def test_scan_qr_finds_rotated_90_qr_code() -> None:
    """scan_qr finds a QR code rotated 90 degrees via fallback strategy."""
    image_bytes = _make_qr_image(FNS_URL, rotate=90)

    result = scan_qr(image_bytes)

    assert result is not None
    assert result.fn == "1234567890123456"
    assert result.amount == Decimal("1250.00")


def test_scan_qr_returns_none_for_invalid_url_in_qr() -> None:
    """scan_qr returns None when QR contains a non-FNS URL (no fn/i/fp params)."""
    image_bytes = _make_qr_image("https://example.com/page?x=1")

    result = scan_qr(image_bytes)

    assert result is None


def test_scan_qr_returns_none_for_garbage_bytes() -> None:
    """scan_qr returns None and does not raise on random binary input."""
    result = scan_qr(b"\x00\x01\x02\x03" * 100)

    assert result is None


def test_scan_qr_accepts_jpeg_input() -> None:
    """scan_qr works when the input image is JPEG bytes."""
    qr = qrcode.QRCode(box_size=10, border=4)
    qr.add_data(FNS_URL)
    qr.make(fit=True)
    img: Image.Image = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")

    result = scan_qr(buf.getvalue())

    assert result is not None
    assert result.fp == "987654321"


def test_qr_result_is_dataclass_with_correct_fields() -> None:
    """QRResult exposes the required fields."""
    r = QRResult(
        date=datetime(2023, 1, 1, 12, 0),
        amount=Decimal("100.00"),
        fn="fn",
        fd="fd",
        fp="fp",
        raw_url="raw",
    )
    assert r.date == datetime(2023, 1, 1, 12, 0)
    assert r.amount == Decimal("100.00")
    assert r.fn == "fn"
    assert r.fd == "fd"
    assert r.fp == "fp"
    assert r.raw_url == "raw"
