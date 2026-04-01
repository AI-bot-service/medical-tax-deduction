"""Celery OCR Task (B-08).

Задача process_receipt:
1. Скачивает файл из S3 по ключу из receipts.s3_key
2. Запускает OCR pipeline
3. Сохраняет результат в receipts + receipt_items
4. Обновляет статус: >=0.85 -> DONE, 0.60-0.84 -> REVIEW, <0.60 -> FAILED
5. Для is_rx=True запускает поиск рецепта (если доступен search_service)
6. Уведомляет пользователя через telegram_notifier (fire-and-forget)
"""
from __future__ import annotations

import asyncio
import io
import logging
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: F401

from app.config import settings
from app.models.enums import OCRStatus
from app.models.receipt import Receipt
from app.models.receipt_item import ReceiptItem
from app.services.dedup.receipt_dedup import DuplicateKind, check_receipt_duplicate
from app.services.ocr.pipeline import CONFIDENCE_DONE, CONFIDENCE_REVIEW, ParsedReceipt, process_image
from app.services.storage.s3_client import S3Client, BUCKET_RECEIPTS
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)

# Worker DB engine uses medvychet_worker role (BYPASS RLS)
_worker_engine = create_async_engine(
    settings.database_url_worker,
    pool_pre_ping=True,
    echo=False,
)
_WorkerSession = async_sessionmaker(_worker_engine, expire_on_commit=False)


def _ocr_status_from_confidence(confidence: float) -> OCRStatus | None:
    """Return REVIEW for valid receipts (operator must confirm), or None if confidence too low."""
    if confidence >= CONFIDENCE_REVIEW:
        return OCRStatus.REVIEW  # Always REVIEW — operator sets DONE after confirmation
    return None  # FAILED — do not persist


async def _delete_failed_receipt(
    db: AsyncSession, receipt: Receipt, s3: S3Client, reason: str
) -> None:
    """Delete receipt from DB and its S3 file. FAILED receipts are not stored."""
    logger.warning("Deleting failed receipt %s (%s)", receipt.id, reason)
    try:
        s3.delete_object(BUCKET_RECEIPTS, receipt.s3_key)
    except Exception as exc:
        logger.error("S3 delete failed for %s: %s", receipt.s3_key, exc)
    await db.delete(receipt)
    await db.commit()


async def _run(receipt_id: str) -> None:
    """Async implementation of the OCR task."""
    s3 = S3Client()

    async with _WorkerSession() as db:
        # 1. Fetch receipt record
        result = await db.execute(
            select(Receipt).where(Receipt.id == uuid.UUID(receipt_id))
        )
        receipt = result.scalar_one_or_none()
        if receipt is None:
            logger.error("Receipt %s not found", receipt_id)
            return

        # 2. Download image from S3
        try:
            obj = s3.get_object(BUCKET_RECEIPTS, receipt.s3_key)
            image_bytes: bytes = obj["Body"].read()
        except Exception as exc:
            logger.error("S3 download failed for receipt %s: %s", receipt_id, exc)
            await _delete_failed_receipt(db, receipt, s3, f"s3_download_error: {exc}")
            return

        # 3. Run OCR pipeline
        try:
            parsed: ParsedReceipt = await process_image(image_bytes)
        except Exception as exc:
            logger.error("OCR pipeline failed for receipt %s: %s", receipt_id, exc)
            await _delete_failed_receipt(db, receipt, s3, f"ocr_pipeline_error: {exc}")
            return

        # 4. Determine status — delete if confidence too low (no FAILED in DB)
        ocr_status = _ocr_status_from_confidence(parsed.confidence)
        if ocr_status is None:
            await _delete_failed_receipt(
                db, receipt, s3,
                f"low_confidence={parsed.confidence:.2f} strategy={parsed.strategy}",
            )
            return

        # 5. Проверка на дубликат перед сохранением
        dedup = await check_receipt_duplicate(db, receipt.user_id, parsed)
        if dedup.kind == DuplicateKind.IDENTICAL:
            logger.info(
                "Receipt %s — точный дубль existing=%s, сохраняем для проверки пользователем",
                receipt_id, dedup.existing_id,
            )
            ocr_status = OCRStatus.DUPLICATE_REVIEW
            receipt.duplicate_of_id = dedup.existing_id
        elif dedup.kind == DuplicateKind.CONFLICT:
            logger.warning(
                "Receipt %s — дубль с другим составом existing=%s, отправляем на проверку оператору",
                receipt_id, dedup.existing_id,
            )
            ocr_status = OCRStatus.DUPLICATE_REVIEW
            receipt.duplicate_of_id = dedup.existing_id

        # 6. Update receipt fields
        receipt.purchase_date = parsed.purchase_date
        receipt.pharmacy_name = parsed.pharmacy_name
        receipt.total_amount = float(parsed.total_amount) if parsed.total_amount is not None else None
        receipt.ocr_confidence = parsed.confidence
        receipt.merge_strategy = parsed.strategy
        receipt.ocr_status = ocr_status
        # fiscal_fn/fd не сохраняем для дубликатов: нарушит uq_receipts_fiscal
        if dedup.kind not in (DuplicateKind.IDENTICAL, DuplicateKind.CONFLICT):
            receipt.fiscal_fn = parsed.fiscal_fn
            receipt.fiscal_fd = parsed.fiscal_fd
        receipt.fiscal_fp = parsed.fiscal_fp

        # 7. Determine if any rx items need prescription
        has_rx = any(item.is_rx for item in parsed.items if item.is_rx is True)
        receipt.needs_prescription = has_rx

        # 8. Create receipt_items
        for item in parsed.items:
            receipt_item = ReceiptItem(
                receipt_id=receipt.id,
                drug_name=item.drug_name_raw,
                drug_inn=item.drug_inn,
                quantity=item.quantity if item.quantity is not None else 1.0,
                unit_price=float(item.unit_price) if item.unit_price is not None else 0.0,
                total_price=float(item.total_price) if item.total_price is not None else 0.0,
                is_rx=item.is_rx or False,
            )
            db.add(receipt_item)

        await db.commit()
        await db.refresh(receipt)

        # 9. Prescription search for rx items (best-effort, non-blocking)
        if has_rx and receipt.ocr_status != OCRStatus.FAILED:
            await _try_link_prescriptions(db, receipt, parsed)

        # 10. Notify user (fire-and-forget, errors are swallowed)
        await _notify_user(receipt, parsed)

        logger.info(
            "Receipt %s processed: status=%s confidence=%.2f strategy=%s",
            receipt_id,
            receipt.ocr_status.value,
            parsed.confidence,
            parsed.strategy,
        )


async def _try_link_prescriptions(
    db: AsyncSession, receipt: Receipt, parsed: ParsedReceipt
) -> None:
    """Attempt to auto-link prescriptions for rx items (non-fatal if it fails)."""
    try:
        from app.services.prescriptions.search_service import find_prescription

        items_result = await db.execute(
            select(ReceiptItem).where(ReceiptItem.receipt_id == receipt.id)
        )
        db_items = items_result.scalars().all()

        for db_item in db_items:
            if not db_item.is_rx or db_item.drug_inn is None:
                continue
            match = await find_prescription(
                user_id=receipt.user_id,
                drug_inn=db_item.drug_inn,
                drug_name=db_item.drug_name,
                purchase_date=receipt.purchase_date,
                db=db,
            )
            if match is not None:
                db_item.prescription_id = match.prescription.id

        await db.commit()
    except Exception as exc:
        logger.warning("Prescription auto-link failed for receipt %s: %s", receipt.id, exc)


async def _notify_user(receipt: Receipt, parsed: ParsedReceipt) -> None:
    """Send Telegram notification about OCR result (fire-and-forget)."""
    try:
        from bot.services.telegram_notifier import notify_receipt_processed  # type: ignore[import]

        await notify_receipt_processed(receipt, parsed)
    except Exception:
        pass  # Notifier not available yet (C-03) — silently skip


@celery_app.task(name="workers.tasks.ocr_task.process_receipt", bind=True, max_retries=3)
def process_receipt(self, receipt_id: str) -> dict:
    """Celery task: process a single receipt through the OCR pipeline."""
    try:
        asyncio.run(_run(receipt_id))
        return {"receipt_id": receipt_id, "status": "processed"}
    except Exception as exc:
        logger.error("process_receipt failed for %s: %s", receipt_id, exc)
        raise self.retry(exc=exc, countdown=60)
