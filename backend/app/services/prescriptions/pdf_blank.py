"""Prescription PDF Blank Generator (E-05).

Generates a ReportLab PDF for form 107-1/у (ambulatory prescription blank)
with filled physician and medication fields.

Key design decisions:
- A5 page size (148 × 210 mm) — matches standard prescription blank
- Cyrillic via DejaVuSans (bundled with reportlab) or fallback to Helvetica
- PDF saved to S3: medvychet-prescriptions/{user_id}/blank_{prescription_id}.pdf
- If the S3 object already exists, skip generation and return presigned URL
"""
from __future__ import annotations

import io
import logging
import uuid
from datetime import date

import botocore.exceptions
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prescription import Prescription
from app.services.storage.s3_client import BUCKET_PRESCRIPTIONS, S3Client

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# ReportLab lazy imports
# ---------------------------------------------------------------------------

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A5
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm, mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (
        HRFlowable,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    _HAS_REPORTLAB = True
except ImportError:
    _HAS_REPORTLAB = False


def _register_cyrillic_font() -> str:
    """Register DejaVuSans for Cyrillic or fall back to Helvetica."""
    if not _HAS_REPORTLAB:
        return "Helvetica"
    try:
        # DejaVuSans ships with reportlab in newer versions
        pdfmetrics.registerFont(TTFont("DejaVuSans", "DejaVuSans.ttf"))
        return "DejaVuSans"
    except Exception:
        pass
    try:
        import reportlab

        import os

        rl_dir = os.path.dirname(reportlab.__file__)
        path = os.path.join(rl_dir, "fonts", "DejaVuSans.ttf")
        if os.path.exists(path):
            pdfmetrics.registerFont(TTFont("DejaVuSans", path))
            return "DejaVuSans"
    except Exception:
        pass
    return "Helvetica"


# ---------------------------------------------------------------------------
# PDF generation
# ---------------------------------------------------------------------------

DOC_TYPE_LABELS: dict[str, str] = {
    "recipe_107": "Форма № 107-1/у",
    "recipe_egisz": "Электронный рецепт ЕГИСЗ",
    "doc_025": "Форма № 025/у",
    "doc_003": "Форма № 003/у",
    "doc_043": "Форма № 043/у",
    "doc_111": "Форма № 111/у",
    "doc_025_1": "Форма № 025-1/у",
}


def _build_blank_pdf(prescription: Prescription) -> bytes:
    """Build the 107-1/u prescription blank PDF bytes."""
    if not _HAS_REPORTLAB:
        raise RuntimeError("reportlab is not installed")

    font = _register_cyrillic_font()
    buf = io.BytesIO()

    doc = SimpleDocTemplate(
        buf,
        pagesize=A5,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
        title=f"Рецепт {prescription.id}",
    )

    styles = getSampleStyleSheet()
    heading_style = ParagraphStyle(
        "Heading",
        parent=styles["Normal"],
        fontName=font,
        fontSize=10,
        leading=14,
        alignment=1,  # center
        spaceAfter=4,
    )
    label_style = ParagraphStyle(
        "Label",
        parent=styles["Normal"],
        fontName=font,
        fontSize=7,
        leading=9,
        textColor=colors.grey,
    )
    field_style = ParagraphStyle(
        "Field",
        parent=styles["Normal"],
        fontName=font,
        fontSize=9,
        leading=12,
    )
    small_style = ParagraphStyle(
        "Small",
        parent=styles["Normal"],
        fontName=font,
        fontSize=7,
        leading=9,
        textColor=colors.grey,
        alignment=1,
    )

    form_label = DOC_TYPE_LABELS.get(prescription.doc_type, "Рецепт")
    issue_date_str = (
        prescription.issue_date.strftime("%d.%m.%Y")
        if isinstance(prescription.issue_date, date)
        else str(prescription.issue_date)
    )
    expires_at_str = (
        prescription.expires_at.strftime("%d.%m.%Y")
        if isinstance(prescription.expires_at, date)
        else str(prescription.expires_at)
    )

    story = [
        Paragraph("РЕЦЕПТ", heading_style),
        Paragraph(form_label, heading_style),
        HRFlowable(width="100%", thickness=0.5, color=colors.black),
        Spacer(1, 4 * mm),
        # Clinic name
        Paragraph("Медицинская организация:", label_style),
        Paragraph(prescription.clinic_name or "___________________________", field_style),
        Spacer(1, 3 * mm),
        # Date
        Paragraph("Дата:", label_style),
        Paragraph(issue_date_str, field_style),
        Spacer(1, 3 * mm),
        # Patient (blank — to be filled manually)
        Paragraph("ФИО пациента (заполняется вручную):", label_style),
        Paragraph("___________________________________________", field_style),
        Spacer(1, 3 * mm),
        # Age
        Paragraph("Возраст: _______________", field_style),
        Spacer(1, 4 * mm),
        HRFlowable(width="100%", thickness=0.5, color=colors.grey),
        Spacer(1, 4 * mm),
        # Rp section
        Paragraph("Rp:", heading_style),
        Spacer(1, 2 * mm),
        Paragraph("Препарат:", label_style),
        Paragraph(prescription.drug_name, field_style),
    ]

    if prescription.drug_inn:
        story += [
            Paragraph("МНН:", label_style),
            Paragraph(prescription.drug_inn, field_style),
        ]

    if prescription.dosage:
        story += [
            Spacer(1, 2 * mm),
            Paragraph("Дозировка:", label_style),
            Paragraph(prescription.dosage, field_style),
        ]

    story += [
        Spacer(1, 3 * mm),
        Paragraph("Количество: _______________", field_style),
        Spacer(1, 4 * mm),
        HRFlowable(width="100%", thickness=0.5, color=colors.grey),
        Spacer(1, 4 * mm),
        # Doctor
        Paragraph("Врач:", label_style),
        Paragraph(prescription.doctor_name, field_style),
    ]

    if prescription.doctor_specialty:
        story += [
            Paragraph("Специальность:", label_style),
            Paragraph(prescription.doctor_specialty, field_style),
        ]

    story += [
        Spacer(1, 3 * mm),
        Paragraph("Подпись врача: ___________  Печать:", field_style),
        Spacer(1, 4 * mm),
        HRFlowable(width="100%", thickness=0.5, color=colors.grey),
        Spacer(1, 3 * mm),
        Paragraph(f"Действителен до: {expires_at_str}", field_style),
        Spacer(1, 4 * mm),
        Paragraph(
            f"Сформировано сервисом МедВычет · ID: {prescription.id}",
            small_style,
        ),
    ]

    doc.build(story)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Public async API
# ---------------------------------------------------------------------------


async def generate_107_blank(
    prescription_id: uuid.UUID,
    db: AsyncSession,
    s3: S3Client | None = None,
) -> str:
    """Generate (or retrieve cached) 107-1/у PDF blank; return presigned URL.

    Steps:
    1. Load Prescription from DB
    2. Check if S3 key already exists → if so, return presigned URL
    3. Build PDF bytes via ReportLab
    4. Upload to S3
    5. Return presigned URL (TTL 15 min)
    """
    result = await db.execute(
        select(Prescription).where(Prescription.id == prescription_id)
    )
    prescription = result.scalar_one_or_none()
    if prescription is None:
        raise ValueError(f"Prescription {prescription_id} not found")

    s3_client = s3 or S3Client()
    s3_key = f"{prescription.user_id}/blank_{prescription_id}.pdf"

    # Check if already exists
    try:
        s3_client.get_object(BUCKET_PRESCRIPTIONS, s3_key)
        logger.debug("PDF blank already exists in S3: %s", s3_key)
        return s3_client.generate_presigned_url(
            BUCKET_PRESCRIPTIONS, s3_key, ttl=900
        )
    except botocore.exceptions.ClientError as exc:
        if exc.response.get("Error", {}).get("Code") not in ("NoSuchKey", "404"):
            raise

    # Generate
    pdf_bytes = _build_blank_pdf(prescription)

    # Upload
    s3_client.upload_file(
        bucket=BUCKET_PRESCRIPTIONS,
        key=s3_key,
        data=pdf_bytes,
        content_type="application/pdf",
    )
    logger.info("PDF blank uploaded to S3: %s/%s", BUCKET_PRESCRIPTIONS, s3_key)

    return s3_client.generate_presigned_url(
        BUCKET_PRESCRIPTIONS, s3_key, ttl=900
    )
