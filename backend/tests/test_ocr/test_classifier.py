"""Tests for Batch Classifier (B-09).

Uses mocked Tesseract and pyzbar to avoid heavy dependencies in CI.
"""
from __future__ import annotations

import contextlib
import time
from unittest.mock import MagicMock, patch

import pytest

from app.services.ocr.batch_classifier import ClassificationResult, classify

_MINIMAL_JPEG = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t"
    b"\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a"
    b"\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\x1e"
    b"\x1b\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f"
    b"\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00"
    b"\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01"
    b"\x00\x00?\x00\xfb\xd4\xff\xd9"
)

_MOD = "app.services.ocr.batch_classifier"


def _fake_image():
    img = MagicMock()
    img.convert.return_value = img
    return img


@contextlib.contextmanager
def _mocked_classify(ocr_text: str = "", qr_payloads: list | None = None):
    """Context manager that mocks all heavy deps and yields classify() callable."""
    barcode_mocks = []
    if qr_payloads:
        for payload in qr_payloads:
            bm = MagicMock()
            bm.data = payload
            barcode_mocks.append(bm)

    img_mock = _fake_image()
    tess_mock = MagicMock()
    tess_mock.image_to_string.return_value = ocr_text
    img_module_mock = MagicMock()
    img_module_mock.open.return_value = img_mock

    with contextlib.ExitStack() as stack:
        stack.enter_context(patch(f"{_MOD}._HAS_PIL", True))
        stack.enter_context(patch(f"{_MOD}._HAS_NUMPY", True))
        stack.enter_context(patch(f"{_MOD}._HAS_TESSERACT", True))
        stack.enter_context(patch(f"{_MOD}._HAS_PYZBAR", True))
        stack.enter_context(patch(f"{_MOD}.Image", img_module_mock))
        stack.enter_context(patch(f"{_MOD}.np"))
        stack.enter_context(patch(f"{_MOD}.pyzbar_decode", return_value=barcode_mocks))
        stack.enter_context(patch(f"{_MOD}.pytesseract", tess_mock))
        yield classify


# ── Step 1: QR decode → receipt ───────────────────────────────────────────────

class TestStep1QR:
    def test_fns_qr_returns_receipt(self):
        """FNS QR payload → receipt, confidence=1.0."""
        fns_payload = b"t=20230101T1200&s=100.00&fn=1234567890&i=12345&fp=9"
        with _mocked_classify(qr_payloads=[fns_payload]) as cl:
            result = cl(_MINIMAL_JPEG)
        assert result.classified_as == "receipt"
        assert result.confidence == 1.0
        assert "QR:FNS" in result.keywords_found

    def test_non_fns_qr_falls_through_to_unknown(self):
        """Non-FNS QR and no keywords → unknown."""
        non_fns = b"https://example.com"
        with _mocked_classify(qr_payloads=[non_fns], ocr_text="random text") as cl:
            result = cl(_MINIMAL_JPEG)
        assert result.classified_as == "unknown"


# ── Step 2: receipt keywords ──────────────────────────────────────────────────

class TestStep2ReceiptKeywords:
    def test_3_receipt_keywords_returns_receipt(self):
        """≥3 receipt keywords → receipt, confidence=0.85."""
        ocr = "ФН 12345 ФД 67890 АПТЕКА Здоровье ИТОГО 500 руб"
        with _mocked_classify(ocr_text=ocr) as cl:
            result = cl(_MINIMAL_JPEG)
        assert result.classified_as == "receipt"
        assert result.confidence == 0.85

    def test_2_receipt_keywords_falls_through(self):
        """Only 2 receipt keywords → NOT classified as receipt at step 2."""
        ocr = "ФН 12345 АПТЕКА Здоровье"
        with _mocked_classify(ocr_text=ocr) as cl:
            result = cl(_MINIMAL_JPEG)
        # must not be receipt via step 2 (confidence 0.85)
        if result.classified_as == "receipt":
            assert result.confidence != 0.85


# ── Step 3: prescription keywords A ──────────────────────────────────────────

class TestStep3PrescriptionA:
    def test_recipe_107_keywords(self):
        """Рецепт + ВРАЧ + МНН → prescription, confidence=0.85, doc=recipe_107."""
        ocr = "Рецепт 107-1/у\nВрач Иванов И.И.\nМНН: ибупрофен"
        with _mocked_classify(ocr_text=ocr) as cl:
            result = cl(_MINIMAL_JPEG)
        assert result.classified_as == "prescription"
        assert result.confidence >= 0.85
        assert result.recommended_doc_type == "recipe_107"

    def test_single_rx_keyword_a_falls_through(self):
        """Only 1 keyword → not matched at step 3."""
        ocr = "ВРАЧ Иванов"
        with _mocked_classify(ocr_text=ocr) as cl:
            result = cl(_MINIMAL_JPEG)
        if result.classified_as == "prescription" and result.recommended_doc_type == "recipe_107":
            assert result.confidence < 0.85


# ── Step 4: prescription keywords B ──────────────────────────────────────────

class TestStep4PrescriptionB:
    def test_medical_card_returns_prescription(self):
        """МЕДИЦИНСКАЯ + ДИАГНОЗ → prescription, confidence=0.80, doc=doc_025."""
        ocr = "ВЫПИСКА ИЗ МЕДИЦИНСКОЙ КАРТЫ\nДИАГНОЗ: J06.9\n025/у"
        with _mocked_classify(ocr_text=ocr) as cl:
            result = cl(_MINIMAL_JPEG)
        assert result.classified_as == "prescription"
        assert result.confidence == 0.80
        assert result.recommended_doc_type == "doc_025"


# ── Step 5: unknown ───────────────────────────────────────────────────────────

class TestStep5Unknown:
    def test_random_text_returns_unknown(self):
        ocr = "случайный текст без ключевых слов"
        with _mocked_classify(ocr_text=ocr) as cl:
            result = cl(_MINIMAL_JPEG)
        assert result.classified_as == "unknown"
        assert result.confidence == 0.0
        assert result.recommended_doc_type is None

    def test_no_deps_returns_unknown(self):
        """When heavy deps are unavailable, falls through to unknown."""
        with patch(f"{_MOD}._HAS_PIL", False):
            with patch(f"{_MOD}._HAS_PYZBAR", False):
                with patch(f"{_MOD}._HAS_TESSERACT", False):
                    result = classify(_MINIMAL_JPEG)
        assert result.classified_as == "unknown"

    def test_performance_100_calls(self):
        """100 calls with mocked OCR must average < 0.5 sec each."""
        with _mocked_classify(ocr_text="") as cl:
            N = 100
            start = time.perf_counter()
            for _ in range(N):
                cl(_MINIMAL_JPEG)
            elapsed = time.perf_counter() - start

        avg = elapsed / N
        assert avg < 0.5, f"Average classify time {avg:.3f}s > 0.5s limit"
