"""Tests for EasyOCR and Tesseract engine wrappers (B-04).

All tests use mocks so they run without GPU or Tesseract installed.
"""
from __future__ import annotations

import struct
import sys
import zlib
from concurrent.futures import Future
from unittest.mock import MagicMock, patch

import pytest

from app.services.ocr.ocr_result import OCRResult, TextBlock

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_minimal_png(width: int = 10, height: int = 10) -> bytes:
    """Create a minimal valid 1-channel white PNG."""
    raw_rows = b"".join(b"\x00" + b"\xff" * width for _ in range(height))
    compressed = zlib.compress(raw_rows)

    def chunk(name: bytes, data: bytes) -> bytes:
        length = struct.pack(">I", len(data))
        crc = struct.pack(">I", zlib.crc32(name + data) & 0xFFFFFFFF)
        return length + name + data + crc

    signature = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    png = signature + chunk(b"IHDR", ihdr_data) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")
    return png


_SAMPLE_PNG = _make_minimal_png()

# Fake EasyOCR raw output (list of [bbox_points, text, confidence])
_FAKE_EASYOCR_RAW = [
    ([[0, 0], [100, 0], [100, 20], [0, 20]], "АПТЕКА №1", 0.95),
    ([[0, 25], [150, 25], [150, 45], [0, 45]], "Парацетамол 500мг", 0.88),
    ([[0, 50], [80, 50], [80, 70], [0, 70]], "120.50 руб", 0.91),
    ([[0, 75], [120, 75], [120, 95], [0, 95]], "ИТОГО: 120.50", 0.93),
    ([[0, 100], [90, 100], [90, 120], [0, 120]], "ФН: 1234567890", 0.87),
]


# ---------------------------------------------------------------------------
# OCRResult / TextBlock unit tests
# ---------------------------------------------------------------------------

class TestOCRResultTypes:
    def test_textblock_fields(self):
        tb = TextBlock(text="hello", confidence=0.9, bbox=(0, 0, 10, 10))
        assert tb.text == "hello"
        assert tb.confidence == 0.9
        assert tb.bbox == (0, 0, 10, 10)

    def test_ocr_result_defaults(self):
        result = OCRResult()
        assert result.blocks == []
        assert result.confidence == 0.0
        assert result.engine_used == ""

    def test_ocr_result_full_text(self):
        blocks = [
            TextBlock(text="line one", confidence=0.9, bbox=(0, 0, 1, 1)),
            TextBlock(text="line two", confidence=0.8, bbox=(0, 0, 1, 1)),
        ]
        result = OCRResult(blocks=blocks, confidence=0.85, engine_used="test")
        assert "line one" in result.full_text
        assert "line two" in result.full_text

    def test_ocr_result_full_text_skips_blank(self):
        blocks = [
            TextBlock(text="hello", confidence=0.9, bbox=(0, 0, 1, 1)),
            TextBlock(text="   ", confidence=0.5, bbox=(0, 0, 1, 1)),
        ]
        result = OCRResult(blocks=blocks, confidence=0.7, engine_used="test")
        assert result.full_text == "hello"


# ---------------------------------------------------------------------------
# EasyOCR engine tests
# ---------------------------------------------------------------------------

class TestEasyOCREngine:
    def test_recognize_returns_ocr_result(self):
        from app.services.ocr.easyocr_engine import EasyOCREngine, _executor

        engine = EasyOCREngine()
        future: Future = Future()
        future.set_result(_FAKE_EASYOCR_RAW)

        with patch.object(_executor, "submit", return_value=future):
            result = engine.recognize(_SAMPLE_PNG)

        assert isinstance(result, OCRResult)
        assert result.engine_used == "easyocr"
        assert len(result.blocks) == 5
        assert result.confidence > 0.85

    def test_recognize_filters_empty_text(self):
        from app.services.ocr.easyocr_engine import EasyOCREngine, _executor

        raw_with_blanks = [
            ([[0, 0], [10, 0], [10, 10], [0, 10]], "", 0.9),
            ([[0, 0], [10, 0], [10, 10], [0, 10]], "  ", 0.8),
            ([[0, 0], [10, 0], [10, 10], [0, 10]], "текст", 0.7),
        ]
        engine = EasyOCREngine()
        future: Future = Future()
        future.set_result(raw_with_blanks)

        with patch.object(_executor, "submit", return_value=future):
            result = engine.recognize(_SAMPLE_PNG)

        assert len(result.blocks) == 1
        assert result.blocks[0].text == "текст"

    def test_recognize_timeout_raises_runtime_error(self):
        from concurrent.futures import TimeoutError as FuturesTimeoutError

        from app.services.ocr.easyocr_engine import EasyOCREngine, _executor

        engine = EasyOCREngine()
        mock_future = MagicMock()
        mock_future.result.side_effect = FuturesTimeoutError()

        with patch.object(_executor, "submit", return_value=mock_future):
            with pytest.raises(RuntimeError, match="timed out"):
                engine.recognize(_SAMPLE_PNG)

    def test_recognize_exception_raises_runtime_error(self):
        from app.services.ocr.easyocr_engine import EasyOCREngine, _executor

        engine = EasyOCREngine()
        mock_future = MagicMock()
        mock_future.result.side_effect = Exception("model crash")

        with patch.object(_executor, "submit", return_value=mock_future):
            with pytest.raises(RuntimeError, match="recognition failed"):
                engine.recognize(_SAMPLE_PNG)

    def test_recognize_empty_result_returns_zero_confidence(self):
        from app.services.ocr.easyocr_engine import EasyOCREngine, _executor

        engine = EasyOCREngine()
        future: Future = Future()
        future.set_result([])

        with patch.object(_executor, "submit", return_value=future):
            result = engine.recognize(_SAMPLE_PNG)

        assert result.confidence == 0.0
        assert result.blocks == []

    def test_min_blocks_threshold(self):
        from app.services.ocr.easyocr_engine import EasyOCREngine

        engine = EasyOCREngine()
        assert engine.min_blocks_threshold == 5

    def test_bbox_conversion_from_easyocr_points(self):
        from app.services.ocr.easyocr_engine import EasyOCREngine, _executor

        # Verify that rotated bboxes are normalised to (xmin, ymin, xmax, ymax)
        raw = [([[10, 5], [50, 5], [50, 25], [10, 25]], "test", 0.9)]
        engine = EasyOCREngine()
        future: Future = Future()
        future.set_result(raw)

        with patch.object(_executor, "submit", return_value=future):
            result = engine.recognize(_SAMPLE_PNG)

        bbox = result.blocks[0].bbox
        assert bbox == (10, 5, 50, 25)


# ---------------------------------------------------------------------------
# Tesseract engine tests
# ---------------------------------------------------------------------------

_FAKE_TESS_DATA_5_BLOCKS = {
    "text": ["АПТЕКА", "Парацетамол", "500мг", "120.50", "ИТОГО"],
    "conf": [95, 88, 91, 93, 87],
    "left": [0, 0, 50, 0, 0],
    "top": [0, 25, 25, 50, 75],
    "width": [100, 120, 40, 80, 90],
    "height": [20, 20, 20, 20, 20],
}

_FAKE_TESS_DATA_2_BLOCKS = {
    "text": ["только", "два"],
    "conf": [80, 75],
    "left": [0, 0],
    "top": [0, 20],
    "width": [60, 40],
    "height": [18, 18],
}


class TestTesseractEngine:
    """Tests for TesseractEngine.

    pytesseract is mocked via sys.modules so tests pass without Tesseract installed.
    """

    @pytest.fixture(autouse=True)
    def _mock_pytesseract(self, monkeypatch):
        """Inject a MagicMock for pytesseract into sys.modules before each test."""
        mock = MagicMock()
        mock.Output.DICT = "dict"
        monkeypatch.setitem(sys.modules, "pytesseract", mock)
        self._pytesseract = mock

    def test_recognize_returns_ocr_result(self):
        from app.services.ocr.tesseract_engine import TesseractEngine

        self._pytesseract.image_to_data.return_value = _FAKE_TESS_DATA_5_BLOCKS
        result = TesseractEngine().recognize(_SAMPLE_PNG)

        assert isinstance(result, OCRResult)
        assert "tesseract" in result.engine_used
        assert len(result.blocks) == 5

    def test_recognize_uses_psm6_primary(self):
        from app.services.ocr.tesseract_engine import TesseractEngine

        self._pytesseract.image_to_data.return_value = _FAKE_TESS_DATA_5_BLOCKS
        TesseractEngine().recognize(_SAMPLE_PNG)

        call_configs = [call.kwargs.get("config", "") or call.args[2] for call in self._pytesseract.image_to_data.call_args_list]
        assert any("--psm 6" in c for c in call_configs)

    def test_fallback_to_psm4_when_few_blocks(self):
        from app.services.ocr.tesseract_engine import TesseractEngine

        def fake(img, lang, config, output_type):
            if "--psm 6" in config:
                return _FAKE_TESS_DATA_2_BLOCKS
            return _FAKE_TESS_DATA_5_BLOCKS

        self._pytesseract.image_to_data.side_effect = fake
        result = TesseractEngine().recognize(_SAMPLE_PNG)

        assert self._pytesseract.image_to_data.call_count == 2
        assert "psm4" in result.engine_used

    def test_no_fallback_when_5_or_more_blocks(self):
        from app.services.ocr.tesseract_engine import TesseractEngine

        self._pytesseract.image_to_data.return_value = _FAKE_TESS_DATA_5_BLOCKS
        TesseractEngine().recognize(_SAMPLE_PNG)

        assert self._pytesseract.image_to_data.call_count == 1

    def test_confidence_normalised_to_0_1(self):
        from app.services.ocr.tesseract_engine import TesseractEngine

        self._pytesseract.image_to_data.return_value = _FAKE_TESS_DATA_5_BLOCKS
        result = TesseractEngine().recognize(_SAMPLE_PNG)

        for block in result.blocks:
            assert 0.0 <= block.confidence <= 1.0

    def test_negative_confidence_skipped(self):
        from app.services.ocr.tesseract_engine import TesseractEngine

        self._pytesseract.image_to_data.return_value = {
            "text": ["реальный", "мусор"],
            "conf": [90, -1],
            "left": [0, 0],
            "top": [0, 20],
            "width": [80, 50],
            "height": [18, 18],
        }
        result = TesseractEngine().recognize(_SAMPLE_PNG)

        assert len(result.blocks) == 1
        assert result.blocks[0].text == "реальный"

    def test_engine_used_label(self):
        from app.services.ocr.tesseract_engine import TesseractEngine

        self._pytesseract.image_to_data.return_value = _FAKE_TESS_DATA_5_BLOCKS
        result = TesseractEngine().recognize(_SAMPLE_PNG)

        assert result.engine_used == "tesseract_psm6"

    def test_bad_image_bytes_raises_runtime_error(self):
        from app.services.ocr.tesseract_engine import TesseractEngine

        with pytest.raises(RuntimeError, match="Cannot decode image"):
            TesseractEngine().recognize(b"not an image")
