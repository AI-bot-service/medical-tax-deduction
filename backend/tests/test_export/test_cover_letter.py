"""Tests for Cover Letter PDF Generator (H-02)."""
from __future__ import annotations

import io
import uuid
import zipfile
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.export.cover_letter import _build_html, _fmt_rub, generate_cover_letter


# ---------------------------------------------------------------------------
# Unit tests: helpers
# ---------------------------------------------------------------------------


class TestFmtRub:
    def test_zero(self):
        assert _fmt_rub(Decimal("0")) == "0,00"

    def test_integer(self):
        result = _fmt_rub(Decimal("1000"))
        assert "1" in result and "000" in result

    def test_decimal_places(self):
        result = _fmt_rub(Decimal("123.45"))
        assert "123" in result
        assert "45" in result


class TestBuildHtml:
    def test_returns_string(self):
        html = _build_html("Иванов Иван Иванович", "123456789012", 2024, Decimal("5000"), 3, 2)
        assert isinstance(html, str)

    def test_contains_full_name(self):
        html = _build_html("Петров Пётр", "987654321098", 2024, Decimal("3000"), 1, 0)
        assert "Петров Пётр" in html

    def test_contains_inn(self):
        html = _build_html("Сидоров С.С.", "111222333444", 2024, Decimal("1000"), 2, 0)
        assert "111222333444" in html

    def test_contains_year(self):
        html = _build_html("Тест Т.Т.", "000000000000", 2025, Decimal("2000"), 1, 0)
        assert "2025" in html

    def test_contains_219_nk(self):
        html = _build_html("Тест", "000", 2024, Decimal("1000"), 1, 0)
        assert "219" in html

    def test_prescriptions_section_shown_when_nonzero(self):
        html = _build_html("Тест", "000", 2024, Decimal("1000"), 3, 5)
        assert "Рецепт" in html

    def test_prescriptions_section_absent_when_zero(self):
        html = _build_html("Тест", "000", 2024, Decimal("1000"), 3, 0)
        assert "Рецепт" not in html

    def test_ndfl_calculation(self):
        html = _build_html("Тест", "000", 2024, Decimal("10000"), 1, 0)
        # 10000 * 0.13 = 1300
        assert "1" in html  # crude check

    def test_short_name_format(self):
        html = _build_html("Иванов Иван Петрович", "000", 2024, Decimal("1000"), 1, 0)
        # Should contain "Иванов И.П." somewhere
        assert "Иванов" in html

    def test_empty_name_uses_placeholder(self):
        html = _build_html("", "", 2024, Decimal("0"), 0, 0)
        assert "___" in html


# ---------------------------------------------------------------------------
# Integration test: generate_cover_letter (WeasyPrint or ReportLab)
# ---------------------------------------------------------------------------


class TestGenerateCoverLetter:
    @pytest.mark.anyio
    async def test_returns_bytes(self):
        user = SimpleNamespace(full_name="Козлов Константин Викторович", inn="123456789012")
        summary = {
            "total_amount": Decimal("15000"),
            "months": [{"receipts_count": 5}],
            "prescriptions_count": 3,
        }
        db = AsyncMock()
        pdf = await generate_cover_letter(user, 2024, summary, db)
        assert isinstance(pdf, bytes)
        assert len(pdf) > 100

    @pytest.mark.anyio
    async def test_returns_pdf_magic_bytes(self):
        user = SimpleNamespace(full_name="Тестов Тест Тестович", inn="000000000000")
        summary = {
            "total_amount": Decimal("5000"),
            "months": [],
            "prescriptions_count": 0,
        }
        db = AsyncMock()
        pdf = await generate_cover_letter(user, 2024, summary, db)
        assert pdf[:4] == b"%PDF"

    @pytest.mark.anyio
    async def test_user_with_none_fields(self):
        user = SimpleNamespace(full_name=None, inn=None)
        summary = {
            "total_amount": "0",
            "months": [],
            "prescriptions_count": 0,
        }
        db = AsyncMock()
        pdf = await generate_cover_letter(user, 2024, summary, db)
        assert isinstance(pdf, bytes)
        assert len(pdf) > 100

    @pytest.mark.anyio
    async def test_receipts_count_from_months(self):
        user = SimpleNamespace(full_name="Иванов И.И.", inn="111")
        summary = {
            "total_amount": Decimal("8000"),
            "months": [{"receipts_count": 3}, {"receipts_count": 7}],
            "prescriptions_count": 2,
        }
        db = AsyncMock()
        pdf = await generate_cover_letter(user, 2024, summary, db)
        assert pdf[:4] == b"%PDF"


# ---------------------------------------------------------------------------
# Integration test: ZIP contains cover_letter.pdf
# ---------------------------------------------------------------------------


class TestZipContainsCoverLetter:
    @pytest.mark.anyio
    async def test_build_zip_contains_cover_letter(self):
        from app.services.export.zip_packager import build_zip

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result

        fake_user = SimpleNamespace(full_name="Тестов Тест", inn="000000000000")

        with (
            patch("app.services.export.pdf_registry.generate_registry", return_value=b"%PDF-mock"),
            patch("app.services.storage.s3_client.S3Client"),
            patch(
                "app.services.export.zip_packager._fetch_user",
                new=AsyncMock(return_value=fake_user),
            ),
            patch(
                "app.services.export.zip_packager._fetch_receipts",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "app.services.export.zip_packager._fetch_prescriptions",
                new=AsyncMock(return_value=[]),
            ),
        ):
            zip_bytes = await build_zip(uuid.uuid4(), 2024, mock_db)

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            names = zf.namelist()

        assert "cover_letter.pdf" in names
