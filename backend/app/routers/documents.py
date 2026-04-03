"""Роутер документов — статистика по группам для панели 4 дашборда."""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.document import Document
from app.models.enums import DocType, DocumentStatus, DocumentType, OCRStatus
from app.models.prescription import Prescription
from app.models.receipt import Receipt
from app.models.user import User

router = APIRouter(prefix="/documents", tags=["documents"])

# Типы рецептов
_RECIPE_TYPES = {DocType.RECIPE_107, DocType.RECIPE_EGISZ}

# Типы справок из клиник (без рецептов)
_DOC_TYPES = {DocType.DOC_025, DocType.DOC_003, DocType.DOC_043, DocType.DOC_111, DocType.DOC_025_1}

# OCR-статусы, требующие внимания пользователя
_RECEIPT_PENDING_STATUSES = {OCRStatus.PENDING, OCRStatus.REVIEW, OCRStatus.DUPLICATE_REVIEW}


class DocumentGroupStat(BaseModel):
    group_key: str
    uploaded_count: int
    pending_count: int


class DocumentStatsResponse(BaseModel):
    year: int
    groups: list[DocumentGroupStat]


@router.get("/stats", response_model=DocumentStatsResponse)
async def get_document_stats(
    year: int = Query(..., ge=2000, le=2100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentStatsResponse:
    """Статистика документов пользователя по 5 группам панели 4 за указанный год.

    Требует авторизации. Все группы присутствуют в ответе.
    """
    uid = current_user.id

    # ── 1. recipes: рецепты (107-1/у, ЕГИСЗ) ────────────────────────────────
    rec_total = await db.scalar(
        select(func.count()).where(
            Prescription.user_id == uid,
            Prescription.status != "deleted",
            func.extract("year", Prescription.issue_date) == year,
            Prescription.doc_type.in_([t.value for t in _RECIPE_TYPES]),
        )
    ) or 0
    rec_pending = await db.scalar(
        select(func.count()).where(
            Prescription.user_id == uid,
            Prescription.status != "deleted",
            func.extract("year", Prescription.issue_date) == year,
            Prescription.doc_type.in_([t.value for t in _RECIPE_TYPES]),
            Prescription.duplicate_of_id.isnot(None),
        )
    ) or 0

    # ── 2. clinic_certs: справки из клиник (025/у, 003/у …) + CLINIC_CERT ──
    presc_certs_total = await db.scalar(
        select(func.count()).where(
            Prescription.user_id == uid,
            Prescription.status != "deleted",
            func.extract("year", Prescription.issue_date) == year,
            Prescription.doc_type.in_([t.value for t in _DOC_TYPES]),
        )
    ) or 0
    presc_certs_pending = await db.scalar(
        select(func.count()).where(
            Prescription.user_id == uid,
            Prescription.status != "deleted",
            func.extract("year", Prescription.issue_date) == year,
            Prescription.doc_type.in_([t.value for t in _DOC_TYPES]),
            Prescription.duplicate_of_id.isnot(None),
        )
    ) or 0
    doc_clinic_total = await db.scalar(
        select(func.count()).where(
            Document.user_id == uid,
            Document.tax_year == year,
            Document.doc_type == DocumentType.CLINIC_CERT,
        )
    ) or 0
    doc_clinic_pending = await db.scalar(
        select(func.count()).where(
            Document.user_id == uid,
            Document.tax_year == year,
            Document.doc_type == DocumentType.CLINIC_CERT,
            Document.doc_status == DocumentStatus.PENDING,
        )
    ) or 0

    # ── 3. pharmacy_receipts: чеки из аптек ────────────────────────────────
    rx_total = await db.scalar(
        select(func.count()).where(
            Receipt.user_id == uid,
            func.extract("year", Receipt.purchase_date) == year,
        )
    ) or 0
    rx_pending = await db.scalar(
        select(func.count()).where(
            Receipt.user_id == uid,
            func.extract("year", Receipt.purchase_date) == year,
            Receipt.ocr_status.in_([s.value for s in _RECEIPT_PENDING_STATUSES]),
        )
    ) or 0

    # ── 4. vhi_docs: документы ДМС ─────────────────────────────────────────
    vhi_total = await db.scalar(
        select(func.count()).where(
            Document.user_id == uid,
            Document.tax_year == year,
            Document.doc_type == DocumentType.VHI_CERT,
        )
    ) or 0
    vhi_pending = await db.scalar(
        select(func.count()).where(
            Document.user_id == uid,
            Document.tax_year == year,
            Document.doc_type == DocumentType.VHI_CERT,
            Document.doc_status == DocumentStatus.PENDING,
        )
    ) or 0

    # ── 5. ndfl_certs: справки 2-НДФЛ ──────────────────────────────────────
    ndfl_total = await db.scalar(
        select(func.count()).where(
            Document.user_id == uid,
            Document.tax_year == year,
            Document.doc_type == DocumentType.NDFL_2,
        )
    ) or 0
    ndfl_pending = await db.scalar(
        select(func.count()).where(
            Document.user_id == uid,
            Document.tax_year == year,
            Document.doc_type == DocumentType.NDFL_2,
            Document.doc_status == DocumentStatus.PENDING,
        )
    ) or 0

    return DocumentStatsResponse(
        year=year,
        groups=[
            DocumentGroupStat(
                group_key="clinic_certs",
                uploaded_count=presc_certs_total + doc_clinic_total,
                pending_count=presc_certs_pending + doc_clinic_pending,
            ),
            DocumentGroupStat(
                group_key="recipes",
                uploaded_count=rec_total,
                pending_count=rec_pending,
            ),
            DocumentGroupStat(
                group_key="pharmacy_receipts",
                uploaded_count=rx_total,
                pending_count=rx_pending,
            ),
            DocumentGroupStat(
                group_key="vhi_docs",
                uploaded_count=vhi_total,
                pending_count=vhi_pending,
            ),
            DocumentGroupStat(
                group_key="ndfl_certs",
                uploaded_count=ndfl_total,
                pending_count=ndfl_pending,
            ),
        ],
    )
