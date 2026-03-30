"""Prescriptions Router (E-03).

Endpoints:
  POST /prescriptions          — create prescription (optional photo to S3)
  GET  /prescriptions          — list with doc_type / status filter
  GET  /prescriptions/{id}     — detail
  DELETE /prescriptions/{id}   — soft-delete (status → deleted)
  POST /prescriptions/link     — link prescription to receipt_item
"""
from __future__ import annotations

import logging
import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.enums import DocType, RiskLevel
from app.models.prescription import Prescription
from app.models.receipt_item import ReceiptItem
from app.schemas.prescription import (
    LinkPrescriptionRequest,
    PrescriptionCreate,
    PrescriptionListResponse,
    PrescriptionPatch,
    PrescriptionResponse,
)
from app.services.storage.s3_client import BUCKET_PRESCRIPTIONS, BUCKET_RECEIPTS, S3Client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])

_DISPUTED_DOC_TYPES = {DocType.DOC_025, DocType.DOC_025_1}
_ALLOWED_PHOTO_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}


def _risk_level_for(doc_type: DocType) -> RiskLevel:
    return RiskLevel.DISPUTED if doc_type in _DISPUTED_DOC_TYPES else RiskLevel.STANDARD


# ---------------------------------------------------------------------------
# POST /prescriptions
# ---------------------------------------------------------------------------


@router.post("", response_model=PrescriptionResponse, status_code=201)
async def create_prescription(
    body: PrescriptionCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> PrescriptionResponse:
    """Create a prescription record (without photo). Photo can be added separately."""
    risk_level = _risk_level_for(body.doc_type)

    prescription = Prescription(
        user_id=current_user.id,
        doc_type=body.doc_type,
        doctor_name=body.doctor_name,
        doctor_specialty=body.doctor_specialty,
        clinic_name=body.clinic_name,
        issue_date=body.issue_date,
        expires_at=body.expires_at,
        drug_name=body.drug_name,
        drug_inn=body.drug_inn,
        dosage=body.dosage,
        risk_level=risk_level,
        status="active",
    )
    db.add(prescription)
    await db.commit()
    await db.refresh(prescription)
    return PrescriptionResponse.model_validate(prescription)


# ---------------------------------------------------------------------------
# POST /prescriptions/{id}/photo  — upload photo separately
# ---------------------------------------------------------------------------


@router.post("/{prescription_id}/photo", response_model=PrescriptionResponse)
async def upload_prescription_photo(
    prescription_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> PrescriptionResponse:
    """Attach a photo/scan to an existing prescription."""
    result = await db.execute(
        select(Prescription).where(
            Prescription.id == prescription_id,
            Prescription.user_id == current_user.id,
        )
    )
    prescription = result.scalar_one_or_none()
    if prescription is None:
        raise HTTPException(status_code=404, detail="Рецепт не найден")

    ct = (file.content_type or "").lower().split(";")[0].strip()
    if ct not in _ALLOWED_PHOTO_CONTENT_TYPES:
        raise HTTPException(status_code=422, detail="Поддерживаются JPG, PNG, WEBP, PDF")

    data = await file.read()
    ext = ".pdf" if ct == "application/pdf" else f".{ct.split('/')[1]}"
    s3_key = f"prescriptions/{current_user.id}/{prescription_id}{ext}"

    try:
        s3 = S3Client()
        s3.upload_file(BUCKET_PRESCRIPTIONS, s3_key, data, ct)
    except Exception as exc:
        logger.error("S3 upload failed for prescription %s: %s", prescription_id, exc)
        raise HTTPException(status_code=502, detail="Ошибка загрузки файла")

    prescription.s3_key = s3_key
    await db.commit()
    await db.refresh(prescription)
    return PrescriptionResponse.model_validate(prescription)


# ---------------------------------------------------------------------------
# GET /prescriptions/{id}/image  — presigned URL для фото рецепта
# ---------------------------------------------------------------------------


@router.get("/{prescription_id}/image")
async def get_prescription_image(
    prescription_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    """Return presigned S3 URL for prescription photo."""
    result = await db.execute(
        select(Prescription).where(
            Prescription.id == prescription_id,
            Prescription.user_id == current_user.id,
            Prescription.status != "deleted",
        )
    )
    prescription = result.scalar_one_or_none()
    if prescription is None:
        raise HTTPException(status_code=404, detail="Рецепт не найден")

    if not prescription.s3_key:
        return {"image_url": None}

    try:
        s3 = S3Client()
        # Файлы из batch-загрузки лежат в BUCKET_RECEIPTS, вручную загруженные — в BUCKET_PRESCRIPTIONS
        bucket = BUCKET_RECEIPTS if prescription.s3_key.startswith("receipts/") else BUCKET_PRESCRIPTIONS
        url = s3.generate_presigned_url(bucket, prescription.s3_key)
    except Exception:
        url = None

    return {"image_url": url}


# ---------------------------------------------------------------------------
# GET /prescriptions/{id}/pdf-blank  (E-05)
# ---------------------------------------------------------------------------


@router.get("/{prescription_id}/pdf-blank")
async def get_prescription_pdf_blank(
    prescription_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    """Generate (or return cached) 107-1/u PDF blank for a prescription.

    Returns {"url": "<presigned_s3_url>", "prescription_id": "<uuid>"}.
    """
    from app.services.prescriptions.pdf_blank import generate_107_blank

    # Verify ownership
    result = await db.execute(
        select(Prescription).where(
            Prescription.id == prescription_id,
            Prescription.user_id == current_user.id,
            Prescription.status != "deleted",
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Рецепт не найден")

    try:
        presigned_url = await generate_107_blank(prescription_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        logger.error("PDF blank generation failed for %s: %s", prescription_id, exc)
        raise HTTPException(status_code=503, detail="Генерация PDF недоступна")
    except Exception as exc:
        logger.error("PDF blank error for %s: %s", prescription_id, exc)
        raise HTTPException(status_code=502, detail="Ошибка генерации PDF")

    return {"url": presigned_url, "prescription_id": str(prescription_id)}


# ---------------------------------------------------------------------------
# GET /prescriptions
# ---------------------------------------------------------------------------


@router.get("", response_model=PrescriptionListResponse)
async def list_prescriptions(
    doc_type: DocType | None = Query(default=None),
    status: str | None = Query(default=None, description="active | expired | deleted"),
    batch_id: uuid.UUID | None = Query(default=None, description="Фильтр по batch_id"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> PrescriptionListResponse:
    """List prescriptions with optional doc_type, status and batch_id filters."""
    stmt = select(Prescription).where(Prescription.user_id == current_user.id)

    if doc_type is not None:
        stmt = stmt.where(Prescription.doc_type == doc_type)
    if batch_id is not None:
        stmt = stmt.where(Prescription.batch_id == batch_id)

    today = date.today()
    if status == "active":
        stmt = stmt.where(Prescription.expires_at >= today, Prescription.status == "active")
    elif status == "expired":
        stmt = stmt.where(Prescription.expires_at < today, Prescription.status == "active")
    elif status == "deleted":
        stmt = stmt.where(Prescription.status == "deleted")
    else:
        # Default: exclude deleted
        stmt = stmt.where(Prescription.status != "deleted")

    stmt = stmt.order_by(Prescription.created_at.desc())
    result = await db.execute(stmt)
    prescriptions = result.scalars().all()

    return PrescriptionListResponse(
        items=[PrescriptionResponse.model_validate(p) for p in prescriptions],
        total=len(prescriptions),
    )


# ---------------------------------------------------------------------------
# GET /prescriptions/{id}
# ---------------------------------------------------------------------------


@router.get("/{prescription_id}", response_model=PrescriptionResponse)
async def get_prescription(
    prescription_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> PrescriptionResponse:
    result = await db.execute(
        select(Prescription).where(
            Prescription.id == prescription_id,
            Prescription.user_id == current_user.id,
            Prescription.status != "deleted",
        )
    )
    prescription = result.scalar_one_or_none()
    if prescription is None:
        raise HTTPException(status_code=404, detail="Рецепт не найден")
    return PrescriptionResponse.model_validate(prescription)


# ---------------------------------------------------------------------------
# PATCH /prescriptions/{id}
# ---------------------------------------------------------------------------


@router.patch("/{prescription_id}", response_model=PrescriptionResponse)
async def patch_prescription(
    prescription_id: uuid.UUID,
    body: PrescriptionPatch,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> PrescriptionResponse:
    """Partial update of a prescription (date, drug name, validity, doctor, clinic)."""
    result = await db.execute(
        select(Prescription).where(
            Prescription.id == prescription_id,
            Prescription.user_id == current_user.id,
            Prescription.status != "deleted",
        )
    )
    prescription = result.scalar_one_or_none()
    if prescription is None:
        raise HTTPException(status_code=404, detail="Рецепт не найден")

    if body.issue_date is not None:
        prescription.issue_date = body.issue_date
    if body.drug_name is not None:
        prescription.drug_name = body.drug_name
    if body.drug_inn is not None:
        prescription.drug_inn = body.drug_inn
    if body.dosage is not None:
        prescription.dosage = body.dosage
    if body.doctor_name is not None:
        prescription.doctor_name = body.doctor_name
    if body.clinic_name is not None:
        prescription.clinic_name = body.clinic_name
    if body.validity_days is not None:
        from datetime import timedelta
        base = body.issue_date or prescription.issue_date
        prescription.expires_at = base + timedelta(days=body.validity_days)

    await db.commit()
    await db.refresh(prescription)
    return PrescriptionResponse.model_validate(prescription)


# ---------------------------------------------------------------------------
# DELETE /prescriptions/{id}
# ---------------------------------------------------------------------------


@router.delete("/{prescription_id}", status_code=204)
async def delete_prescription(
    prescription_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> None:
    result = await db.execute(
        select(Prescription).where(
            Prescription.id == prescription_id,
            Prescription.user_id == current_user.id,
        )
    )
    prescription = result.scalar_one_or_none()
    if prescription is None:
        raise HTTPException(status_code=404, detail="Рецепт не найден")

    prescription.status = "deleted"
    await db.commit()


# ---------------------------------------------------------------------------
# POST /prescriptions/link
# ---------------------------------------------------------------------------


@router.post("/link", status_code=200)
async def link_prescription(
    body: LinkPrescriptionRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    """Link a prescription to a receipt_item. Validates user ownership of both."""
    # Verify prescription belongs to current user
    rx_result = await db.execute(
        select(Prescription).where(
            Prescription.id == body.prescription_id,
            Prescription.user_id == current_user.id,
        )
    )
    prescription = rx_result.scalar_one_or_none()
    if prescription is None:
        raise HTTPException(status_code=403, detail="Рецепт не найден или нет доступа")

    # Verify receipt_item belongs to current user (via receipt.user_id join)
    from app.models.receipt import Receipt

    item_result = await db.execute(
        select(ReceiptItem)
        .join(Receipt, ReceiptItem.receipt_id == Receipt.id)
        .where(
            ReceiptItem.id == body.receipt_item_id,
            Receipt.user_id == current_user.id,
        )
    )
    item = item_result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=403, detail="Позиция чека не найдена или нет доступа")

    item.prescription_id = body.prescription_id
    await db.commit()

    return {"receipt_item_id": str(body.receipt_item_id), "prescription_id": str(body.prescription_id)}
