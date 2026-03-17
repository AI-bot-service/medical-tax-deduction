"""QR code scanner for FNS (Russian tax authority) fiscal receipts.

Uses pyzbar + OpenCV with 5 fallback strategies to decode QR codes from
receipt images and parse the encoded FNS fiscal data URL.

FNS QR format: query-string params
  t  — timestamp  e.g. 20231215T1430
  s  — total amount  e.g. 1250.00
  fn — fiscal drive number
  i  — fiscal document number (fd)
  fp — fiscal sign
"""
from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal, InvalidOperation
from urllib.parse import parse_qs, urlparse

import cv2
import numpy as np
from pyzbar.pyzbar import decode as pyzbar_decode

from app.services.ocr.ocr_result import QRResult

logger = logging.getLogger(__name__)

__all__ = ["QRResult", "scan_qr"]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _load_image(image_bytes: bytes) -> np.ndarray | None:
    """Decode raw bytes into an OpenCV BGR image array."""
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img  # None when decoding fails


def _try_decode(img: np.ndarray) -> str | None:
    """Attempt pyzbar decode; return raw QR data string or None."""
    try:
        results = pyzbar_decode(img)
    except Exception:
        return None
    for item in results:
        if item.type == "QRCODE":
            try:
                return item.data.decode("utf-8")
            except UnicodeDecodeError:
                return item.data.decode("latin-1")
    return None


def _rotate(img: np.ndarray, degrees: int) -> np.ndarray:
    """Rotate image by *degrees* (multiples of 90)."""
    k = (degrees // 90) % 4
    return np.rot90(img, k=k)


def _histogram_eq(img: np.ndarray) -> np.ndarray:
    """Apply histogram equalisation to each channel for contrast boost."""
    channels = cv2.split(img)
    eq = [cv2.equalizeHist(c) for c in channels]
    return cv2.merge(eq)


_STRATEGIES = [
    lambda img: img,                          # 1. original
    lambda img: _rotate(img, 90),            # 2. rotate 90°
    lambda img: _rotate(img, 180),           # 3. rotate 180°
    lambda img: _rotate(img, 270),           # 4. rotate 270°
    lambda img: _histogram_eq(img),          # 5. histogram equalisation
]


# ---------------------------------------------------------------------------
# FNS URL parser
# ---------------------------------------------------------------------------

_DATE_FORMATS = (
    "%Y%m%dT%H%M%S",
    "%Y%m%dT%H%M",
    "%Y%m%dT%H",
)


def _parse_fns_date(value: str) -> datetime | None:
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def _parse_fns_url(raw: str) -> QRResult | None:
    """Parse FNS fiscal URL/query-string into a QRResult.

    The QR code may be a full URL or a bare query string.
    Required params: t, s, fn, i, fp.
    """
    # Normalise: if not a URL, treat entire string as query string
    if "://" in raw:
        parsed = urlparse(raw)
        query = parsed.query or parsed.path.lstrip("?")
    else:
        query = raw

    try:
        params = parse_qs(query, keep_blank_values=False)
    except Exception:
        return None

    def _get(key: str) -> str | None:
        vals = params.get(key)
        return vals[0] if vals else None

    t = _get("t")
    s = _get("s")
    fn = _get("fn")
    fd = _get("i")
    fp = _get("fp")

    if not all([t, s, fn, fd, fp]):
        return None

    date = _parse_fns_date(t)  # type: ignore[arg-type]
    if date is None:
        return None

    try:
        amount = Decimal(s)  # type: ignore[arg-type]
    except InvalidOperation:
        return None

    return QRResult(
        date=date,
        amount=amount,
        fn=fn,  # type: ignore[arg-type]
        fd=fd,  # type: ignore[arg-type]
        fp=fp,  # type: ignore[arg-type]
        raw_url=raw,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def scan_qr(image_bytes: bytes) -> QRResult | None:
    """Scan *image_bytes* for an FNS fiscal QR code.

    Tries up to 5 strategies (original orientation, 3 rotations, histogram
    equalisation) and returns the first successfully parsed :class:`QRResult`.
    Returns ``None`` if no valid FNS QR code is found.
    """
    img = _load_image(image_bytes)
    if img is None:
        logger.debug("scan_qr: could not decode image bytes")
        return None

    for i, transform in enumerate(_STRATEGIES):
        try:
            candidate = transform(img)
        except Exception as exc:
            logger.debug("scan_qr strategy %d transform error: %s", i + 1, exc)
            continue

        raw = _try_decode(candidate)
        if raw is None:
            continue

        result = _parse_fns_url(raw)
        if result is not None:
            logger.debug("scan_qr: success on strategy %d", i + 1)
            return result

    return None
