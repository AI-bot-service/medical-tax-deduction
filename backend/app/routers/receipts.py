"""Receipts Router (E-01).

Endpoints:
  POST /receipts/upload         — upload file to S3, create Receipt, enqueue OCR task
  GET  /receipts                — list with year/month filter, grouped by month
  GET  /receipts/{id}           — detail with presigned image URL and items
  PATCH /receipts/{id}          — partial update (purchase_date, pharmacy_name, etc.)
  DELETE /receipts/{id}         — delete receipt (DB + S3)
"""
from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from decimal import Decimal
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import extract, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_current_user, get_db
from app.models.enums import OCRStatus
from app.models.receipt import Receipt
from app.models.receipt_item import ReceiptItem
from app.schemas.receipt import (
    MonthGroup,
    MonthSummary,
    ReceiptDetail,
    ReceiptItemPatch,
    ReceiptItemSchema,
    ReceiptListItem,
    ReceiptListResponse,
    ReceiptPatch,
    ReceiptUploadResponse,
    SummaryResponse,
)
from app.services.storage.s3_client import BUCKET_RECEIPTS, S3Client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/receipts", tags=["receipts"])

_ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
_MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


def _ext_from_upload(file: UploadFile) -> str:
    """Return lower-cased extension from filename, e.g. '.jpg'."""
    if file.filename:
        return PurePosixPath(file.filename).suffix.lower()
    return ""


def _validate_upload(file: UploadFile) -> str:
    """Validate content type and extension; return extension or raise 422."""
    ext = _ext_from_upload(file)
    ct = (file.content_type or "").lower().split(";")[0].strip()

    if ext not in _ALLOWED_EXTENSIONS and ct not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=422,
            detail="Поддерживаются только JPG, PNG, WEBP, PDF файлы",
        )
    # Normalise: if no valid ext but valid content_type, pick a fallback
    if ext not in _ALLOWED_EXTENSIONS:
        _ct_to_ext = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "application/pdf": ".pdf",
        }
        ext = _ct_to_ext.get(ct, ".jpg")
    return ext


# ---------------------------------------------------------------------------
# POST /receipts/upload
# ---------------------------------------------------------------------------


@router.post("/upload", response_model=ReceiptUploadResponse, status_code=201)
async def upload_receipt(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ReceiptUploadResponse:
    """Upload a receipt image/PDF, save to S3, create DB record, enqueue OCR."""
    ext = _validate_upload(file)

    image_data = await file.read()
    if len(image_data) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Файл превышает 20 МБ")

    # Build S3 key
    file_id = uuid.uuid4()
    s3_key = f"receipts/{current_user.id}/{file_id}{ext}"

    # Upload to S3
    try:
        s3 = S3Client()
        content_type = (file.content_type or "image/jpeg").split(";")[0].strip()
        s3.upload_file(BUCKET_RECEIPTS, s3_key, image_data, content_type)
    except Exception as exc:
        logger.error("S3 upload failed: %s", exc)
        raise HTTPException(status_code=502, detail="Ошибка загрузки файла")

    # Create Receipt record
    receipt = Receipt(
        id=file_id,
        user_id=current_user.id,
        s3_key=s3_key,
        ocr_status=OCRStatus.PENDING,
    )
    db.add(receipt)
    await db.commit()
    await db.refresh(receipt)

    # Enqueue Celery OCR task (import deferred to avoid heavy deps at startup)
    try:
        from workers.tasks.ocr_task import process_receipt  # type: ignore[import]

        process_receipt.delay(str(receipt.id))
    except Exception as exc:
        logger.warning("Failed to enqueue OCR task for receipt %s: %s", receipt.id, exc)

    return ReceiptUploadResponse(receipt_id=receipt.id, status=receipt.ocr_status)


# ---------------------------------------------------------------------------
# GET /receipts/summary
# ---------------------------------------------------------------------------

_DEDUCTION_RATE = Decimal("0.13")
_DEDUCTION_LIMIT = Decimal("150000")
_COUNTED_STATUSES = {OCRStatus.DONE, OCRStatus.REVIEW}


@router.get("/summary", response_model=SummaryResponse)
async def get_summary(
    year: int | None = Query(default=None, description="Год (по умолчанию текущий)"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> SummaryResponse:
    """Return yearly summary: monthly breakdown, deduction amount, limit usage."""
    from datetime import datetime

    if year is None:
        year = datetime.now().year

    stmt = (
        select(Receipt)
        .where(
            Receipt.user_id == current_user.id,
            extract("year", Receipt.created_at) == year,
            Receipt.ocr_status.in_([OCRStatus.DONE, OCRStatus.REVIEW]),
        )
        .order_by(Receipt.created_at)
    )
    result = await db.execute(stmt)
    receipts = result.scalars().all()

    # Group by month
    from collections import defaultdict

    groups: dict[str, list[Receipt]] = defaultdict(list)
    for r in receipts:
        month_key = r.created_at.strftime("%Y-%m")
        groups[month_key].append(r)

    months: list[MonthSummary] = []
    for month_key in sorted(groups.keys()):
        group = groups[month_key]
        month_total = sum(
            Decimal(str(r.total_amount)) for r in group if r.total_amount is not None
        )
        month_deduction = (month_total * _DEDUCTION_RATE).quantize(Decimal("0.01"))
        has_missing = any(r.needs_prescription for r in group)
        months.append(
            MonthSummary(
                month=month_key,
                receipts_count=len(group),
                total_amount=month_total,
                deduction_amount=month_deduction,
                has_missing_prescriptions=has_missing,
            )
        )

    total = sum(m.total_amount for m in months)
    deduction = (total * _DEDUCTION_RATE).quantize(Decimal("0.01"))
    limit_pct = min(float(total / _DEDUCTION_LIMIT * 100), 100.0)

    return SummaryResponse(
        year=year,
        months=months,
        total_amount=total,
        deduction_amount=deduction,
        limit_used_pct=round(limit_pct, 2),
    )


# ---------------------------------------------------------------------------
# GET /receipts
# ---------------------------------------------------------------------------


@router.get("", response_model=ReceiptListResponse)
async def list_receipts(
    year: int | None = Query(default=None, description="Фильтр по году"),
    month: int | None = Query(default=None, ge=1, le=12, description="Фильтр по месяцу"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ReceiptListResponse:
    """Return receipts grouped by month, optionally filtered by year/month."""
    stmt = select(Receipt).where(Receipt.user_id == current_user.id)

    if year is not None:
        stmt = stmt.where(extract("year", Receipt.created_at) == year)
    if month is not None:
        stmt = stmt.where(extract("month", Receipt.created_at) == month)

    stmt = stmt.order_by(Receipt.created_at.desc())
    result = await db.execute(stmt)
    receipts = result.scalars().all()

    # Group by month key "YYYY-MM"
    groups: dict[str, list[Receipt]] = defaultdict(list)
    for r in receipts:
        month_key = r.created_at.strftime("%Y-%m")
        groups[month_key].append(r)

    months: list[MonthGroup] = []
    for month_key in sorted(groups.keys(), reverse=True):
        group = groups[month_key]
        total = sum(
            Decimal(str(r.total_amount)) for r in group if r.total_amount is not None
        )
        months.append(
            MonthGroup(
                month=month_key,
                total_amount=total,
                receipts=[ReceiptListItem.model_validate(r) for r in group],
            )
        )

    return ReceiptListResponse(months=months, total_count=len(receipts))


# ---------------------------------------------------------------------------
# GET /receipts/{id}
# ---------------------------------------------------------------------------


@router.get("/{receipt_id}", response_model=ReceiptDetail)
async def get_receipt(
    receipt_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ReceiptDetail:
    """Return receipt detail including presigned image URL and items."""
    stmt = (
        select(Receipt)
        .where(Receipt.id == receipt_id, Receipt.user_id == current_user.id)
        .options(selectinload(Receipt.items))
    )
    result = await db.execute(stmt)
    receipt = result.scalar_one_or_none()
    if receipt is None:
        raise HTTPException(status_code=404, detail="Чек не найден")

    # Generate presigned URL (TTL 15 min)
    image_url: str | None = None
    try:
        s3 = S3Client()
        image_url = s3.generate_presigned_url(BUCKET_RECEIPTS, receipt.s3_key, ttl=900)
    except Exception as exc:
        logger.warning("Failed to generate presigned URL for receipt %s: %s", receipt_id, exc)

    detail = ReceiptDetail.model_validate(receipt)
    detail.image_url = image_url
    detail.items = [ReceiptItemSchema.model_validate(item) for item in receipt.items]
    return detail


# ---------------------------------------------------------------------------
# PATCH /receipts/{id}
# ---------------------------------------------------------------------------


@router.patch("/{receipt_id}", response_model=ReceiptDetail)
async def patch_receipt(
    receipt_id: uuid.UUID,
    body: ReceiptPatch,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ReceiptDetail:
    """Partially update receipt fields and/or its items."""
    stmt = (
        select(Receipt)
        .where(Receipt.id == receipt_id, Receipt.user_id == current_user.id)
        .options(selectinload(Receipt.items))
    )
    result = await db.execute(stmt)
    receipt = result.scalar_one_or_none()
    if receipt is None:
        raise HTTPException(status_code=404, detail="Чек не найден")

    # Update receipt-level fields
    if body.purchase_date is not None:
        receipt.purchase_date = body.purchase_date
    if body.pharmacy_name is not None:
        receipt.pharmacy_name = body.pharmacy_name
    if body.total_amount is not None:
        receipt.total_amount = float(body.total_amount)

    # Update items if provided
    if body.items is not None:
        items_by_id = {item.id: item for item in receipt.items}
        for patch_item in body.items:
            db_item = items_by_id.get(patch_item.id)
            if db_item is None:
                continue  # silently skip unknown items
            if patch_item.drug_name is not None:
                db_item.drug_name = patch_item.drug_name
            if patch_item.drug_inn is not None:
                db_item.drug_inn = patch_item.drug_inn
            if patch_item.quantity is not None:
                db_item.quantity = patch_item.quantity
            if patch_item.unit_price is not None:
                db_item.unit_price = float(patch_item.unit_price)
            if patch_item.total_price is not None:
                db_item.total_price = float(patch_item.total_price)
            if patch_item.is_rx is not None:
                db_item.is_rx = patch_item.is_rx

    await db.commit()
    await db.refresh(receipt)

    # Re-load items after commit
    stmt2 = (
        select(Receipt)
        .where(Receipt.id == receipt_id)
        .options(selectinload(Receipt.items))
    )
    result2 = await db.execute(stmt2)
    receipt = result2.scalar_one()

    detail = ReceiptDetail.model_validate(receipt)
    detail.items = [ReceiptItemSchema.model_validate(item) for item in receipt.items]
    return detail


# ---------------------------------------------------------------------------
# DELETE /receipts/{id}
# ---------------------------------------------------------------------------


@router.delete("/{receipt_id}", status_code=204)
async def delete_receipt(
    receipt_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> None:
    """Delete receipt: remove from DB (cascade removes items) and S3."""
    stmt = select(Receipt).where(Receipt.id == receipt_id, Receipt.user_id == current_user.id)
    result = await db.execute(stmt)
    receipt = result.scalar_one_or_none()
    if receipt is None:
        raise HTTPException(status_code=404, detail="Чек не найден")

    s3_key = receipt.s3_key
    await db.delete(receipt)
    await db.commit()

    # Delete from S3 (non-fatal if it fails)
    try:
        s3 = S3Client()
        s3.delete_object(BUCKET_RECEIPTS, s3_key)
    except Exception as exc:
        logger.warning("Failed to delete S3 object %s: %s", s3_key, exc)
