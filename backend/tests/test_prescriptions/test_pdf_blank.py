"""Tests for Prescription PDF Blank generator (E-05)."""
from __future__ import annotations

import uuid
from datetime import date
from io import BytesIO
from unittest.mock import MagicMock, AsyncMock, patch

import pytest

from app.services.prescriptions.pdf_blank import (
    _build_blank_pdf,
    _register_cyrillic_font,
    generate_107_blank,
    DOC_TYPE_LABELS,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_prescription(**kwargs) -> MagicMock:
    p = MagicMock()
    p.id = kwargs.get("id", uuid.uuid4())
    p.user_id = kwargs.get("user_id", uuid.uuid4())
    p.doc_type = kwargs.get("doc_type", "recipe_107")
    p.doctor_name = kwargs.get("doctor_name", "Иванов Иван Иванович")
    p.doctor_specialty = kwargs.get("doctor_specialty", "Терапевт")
    p.clinic_name = kwargs.get("clinic_name", "Городская поликлиника №1")
    p.issue_date = kwargs.get("issue_date", date(2024, 3, 15))
    p.expires_at = kwargs.get("expires_at", date(2024, 5, 14))
    p.drug_name = kwargs.get("drug_name", "Амоксициллин")
    p.drug_inn = kwargs.get("drug_inn", "Амоксициллин")
    p.dosage = kwargs.get("dosage", "500 мг")
    return p


# ---------------------------------------------------------------------------
# _register_cyrillic_font
# ---------------------------------------------------------------------------


def test_register_cyrillic_font_returns_string():
    result = _register_cyrillic_font()
    assert isinstance(result, str)
    assert result in ("DejaVuSans", "Helvetica", "FreeSans")


# ---------------------------------------------------------------------------
# _build_blank_pdf
# ---------------------------------------------------------------------------


def test_build_blank_pdf_returns_bytes():
    p = _make_prescription()
    try:
        pdf = _build_blank_pdf(p)
    except RuntimeError:
        pytest.skip("reportlab not installed")
    assert isinstance(pdf, bytes)
    assert len(pdf) > 100


def test_build_blank_pdf_starts_with_pdf_header():
    p = _make_prescription()
    try:
        pdf = _build_blank_pdf(p)
    except RuntimeError:
        pytest.skip("reportlab not installed")
    assert pdf[:4] == b"%PDF"


def test_build_blank_pdf_without_optional_fields():
    p = _make_prescription(drug_inn=None, dosage=None, clinic_name=None, doctor_specialty=None)
    try:
        pdf = _build_blank_pdf(p)
    except RuntimeError:
        pytest.skip("reportlab not installed")
    assert isinstance(pdf, bytes)
    assert len(pdf) > 100


def test_build_blank_pdf_all_doc_types():
    for doc_type in DOC_TYPE_LABELS:
        p = _make_prescription(doc_type=doc_type)
        try:
            pdf = _build_blank_pdf(p)
        except RuntimeError:
            pytest.skip("reportlab not installed")
        assert isinstance(pdf, bytes)


# ---------------------------------------------------------------------------
# DOC_TYPE_LABELS
# ---------------------------------------------------------------------------


def test_doc_type_labels_covers_all_types():
    expected = {"recipe_107", "recipe_egisz", "doc_025", "doc_003", "doc_043", "doc_111", "doc_025_1"}
    assert set(DOC_TYPE_LABELS.keys()) == expected


# ---------------------------------------------------------------------------
# generate_107_blank (async, mocked S3 + DB)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_107_blank_returns_url_on_existing():
    """If S3 object exists, returns presigned URL without re-generating."""
    import botocore.exceptions

    prescription_id = uuid.uuid4()
    mock_p = _make_prescription(id=prescription_id)

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(
        scalar_one_or_none=MagicMock(return_value=mock_p)
    ))

    mock_s3 = MagicMock()
    mock_s3.get_object.return_value = b"fake-pdf"
    mock_s3.generate_presigned_url.return_value = "https://s3.example.com/blank.pdf"

    url = await generate_107_blank(prescription_id, mock_db, s3=mock_s3)

    assert url == "https://s3.example.com/blank.pdf"
    mock_s3.upload_file.assert_not_called()


@pytest.mark.asyncio
async def test_generate_107_blank_uploads_when_not_exists():
    """If S3 object does not exist, PDF is generated and uploaded."""
    import botocore.exceptions

    prescription_id = uuid.uuid4()
    mock_p = _make_prescription(id=prescription_id)

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(
        scalar_one_or_none=MagicMock(return_value=mock_p)
    ))

    no_such_key = botocore.exceptions.ClientError(
        {"Error": {"Code": "NoSuchKey", "Message": "Not Found"}}, "GetObject"
    )

    mock_s3 = MagicMock()
    mock_s3.get_object.side_effect = no_such_key
    mock_s3.upload_file.return_value = None
    mock_s3.generate_presigned_url.return_value = "https://s3.example.com/new.pdf"

    try:
        url = await generate_107_blank(prescription_id, mock_db, s3=mock_s3)
    except RuntimeError:
        pytest.skip("reportlab not installed")

    assert url == "https://s3.example.com/new.pdf"
    mock_s3.upload_file.assert_called_once()
    call_kwargs = mock_s3.upload_file.call_args
    assert call_kwargs.kwargs["content_type"] == "application/pdf"
    assert call_kwargs.kwargs["bucket"] == "medvychet-prescriptions"


@pytest.mark.asyncio
async def test_generate_107_blank_raises_for_not_found():
    """ValueError raised when prescription not in DB."""
    prescription_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(
        scalar_one_or_none=MagicMock(return_value=None)
    ))

    with pytest.raises(ValueError, match="not found"):
        await generate_107_blank(prescription_id, mock_db)


@pytest.mark.asyncio
async def test_generate_107_blank_s3_key_format():
    """S3 key follows expected path pattern."""
    import botocore.exceptions

    user_id = uuid.uuid4()
    prescription_id = uuid.uuid4()
    mock_p = _make_prescription(id=prescription_id, user_id=user_id)

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(
        scalar_one_or_none=MagicMock(return_value=mock_p)
    ))

    no_such_key = botocore.exceptions.ClientError(
        {"Error": {"Code": "NoSuchKey", "Message": ""}}, "GetObject"
    )
    mock_s3 = MagicMock()
    mock_s3.get_object.side_effect = no_such_key
    mock_s3.generate_presigned_url.return_value = "https://s3.example.com/x.pdf"

    try:
        await generate_107_blank(prescription_id, mock_db, s3=mock_s3)
    except RuntimeError:
        pytest.skip("reportlab not installed")

    upload_call = mock_s3.upload_file.call_args
    key = upload_call.kwargs["key"]
    assert str(user_id) in key
    assert str(prescription_id) in key
    assert key.endswith(".pdf")
