"""Batch Task (F-01).

Processes a single file within a batch job:
  1. Classify image (batch_classifier) → receipt | prescription | unknown
  2a. If receipt: run OCR pipeline (process_image), save Receipt + items, autolink
  2b. If prescription: save as Prescription record
  3. Increment batch_job counters atomically
  4. Publish SSE event to Redis PubSub channel batch:{batch_id}
  5. If all files done → mark batch_job completed
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models.batch_job import BatchJob
from app.models.enums import BatchStatus, DocType, OCRStatus, RiskLevel
from app.models.prescription import Prescription
from app.models.receipt import Receipt
from app.models.receipt_item import ReceiptItem
from app.services.ocr.batch_classifier import classify
from app.services.ocr.pipeline import CONFIDENCE_DONE, CONFIDENCE_REVIEW, process_image
from app.services.storage.s3_client import BUCKET_RECEIPTS, S3Client
from workers.celery_app import celery_app
from workers.sse_publisher import publish_batch_event

logger = logging.getLogger(__name__)

_worker_engine = create_async_engine(
    settings.database_url_worker,
    pool_pre_ping=True,
    echo=False,
)
_WorkerSession = async_sessionmaker(_worker_engine, expire_on_commit=False)


@celery_app.task(name="workers.tasks.batch_task.process_batch_file", bind=True, max_retries=2)
def process_batch_file(
    self,
    batch_id: str,
    file_index: int,
    s3_key: str,
    user_id: str,
) -> dict:
    """Celery task: classify and process a single file in a batch."""
    try:
        result = asyncio.run(_run(batch_id, file_index, s3_key, user_id))
        return result
    except Exception as exc:
        logger.error("batch_task failed [%s #%d]: %s", batch_id, file_index, exc)
        raise self.retry(exc=exc, countdown=30)


async def _run(
    batch_id: str,
    file_index: int,
    s3_key: str,
    user_id: str,
) -> dict:
    s3 = S3Client()

    # Download from S3
    try:
        obj = s3.get_object(BUCKET_RECEIPTS, s3_key)
        image_bytes: bytes = obj["Body"].read()
    except Exception as exc:
        logger.error("S3 download failed [%s #%d]: %s", batch_id, file_index, exc)
        await _increment_counter(batch_id, "failed")
        await _maybe_complete_batch(batch_id)
        return {"status": "failed", "reason": "s3_error"}

    # Classify
    classification = classify(image_bytes)
    logger.info(
        "batch %s #%d: classified_as=%s confidence=%.2f",
        batch_id, file_index, classification.classified_as, classification.confidence,
    )

    file_status = "failed"

    if classification.classified_as == "receipt":
        file_status = await _process_receipt_file(
            batch_id, file_index, s3_key, user_id, image_bytes
        )
    elif classification.classified_as == "prescription":
        file_status = await _process_prescription_file(
            batch_id, s3_key, user_id, image_bytes, classification
        )
    else:
        # unknown: save as receipt FAILED
        file_status = await _save_unknown_receipt(batch_id, s3_key, user_id)

    await _increment_counter(batch_id, file_status)

    # Get current counters for SSE payload
    async with _WorkerSession() as db:
        batch = await _get_batch(db, batch_id)
        if batch is None:
            return {"status": file_status}

        completed = (batch.done_count + batch.review_count + batch.failed_count) >= batch.total_files

        publish_batch_event(
            batch_id=batch_id,
            file_index=file_index,
            status=file_status,
            done_count=batch.done_count,
            review_count=batch.review_count,
            failed_count=batch.failed_count,
            total_files=batch.total_files,
            completed=completed,
        )

        if completed:
            batch.status = BatchStatus.COMPLETED if batch.failed_count == 0 else BatchStatus.PARTIAL
            batch.completed_at = datetime.now(timezone.utc)
            await db.commit()

    return {"status": file_status, "batch_id": batch_id}


async def _process_receipt_file(
    batch_id: str,
    file_index: int,
    s3_key: str,
    user_id: str,
    image_bytes: bytes,
) -> str:
    """Run OCR pipeline on receipt image, save Receipt + items. Returns 'done'/'review'/'failed'."""
    async with _WorkerSession() as db:
        receipt = Receipt(
            id=uuid.uuid4(),
            user_id=uuid.UUID(user_id),
            s3_key=s3_key,
            ocr_status=OCRStatus.PENDING,
            batch_id=uuid.UUID(batch_id),
        )
        db.add(receipt)
        await db.commit()
        await db.refresh(receipt)

        try:
            parsed = await process_image(image_bytes)
        except Exception as exc:
            logger.error("OCR failed [%s #%d]: %s", batch_id, file_index, exc)
            receipt.ocr_status = OCRStatus.FAILED
            await db.commit()
            return "failed"

        # Determine OCR status
        if parsed.confidence >= CONFIDENCE_DONE:
            ocr_status = OCRStatus.DONE
            file_status = "done"
        elif parsed.confidence >= CONFIDENCE_REVIEW:
            ocr_status = OCRStatus.REVIEW
            file_status = "review"
        else:
            ocr_status = OCRStatus.FAILED
            file_status = "failed"

        receipt.ocr_status = ocr_status
        receipt.purchase_date = parsed.purchase_date
        receipt.pharmacy_name = parsed.pharmacy_name
        receipt.total_amount = float(parsed.total_amount) if parsed.total_amount is not None else None
        receipt.ocr_confidence = parsed.confidence
        receipt.merge_strategy = parsed.strategy

        has_rx = any(item.is_rx for item in parsed.items if item.is_rx)
        receipt.needs_prescription = has_rx

        for item in parsed.items:
            db_item = ReceiptItem(
                receipt_id=receipt.id,
                drug_name=item.drug_name_raw,
                drug_inn=item.drug_inn,
                quantity=item.quantity if item.quantity is not None else 1.0,
                unit_price=float(item.unit_price) if item.unit_price is not None else 0.0,
                total_price=float(item.total_price) if item.total_price is not None else 0.0,
                is_rx=item.is_rx or False,
            )
            db.add(db_item)

        await db.commit()

        # Autolink prescriptions
        if has_rx and ocr_status != OCRStatus.FAILED:
            await _autolink_prescriptions(db, receipt, uuid.UUID(batch_id), parsed)

        return file_status


async def _process_prescription_file(
    batch_id: str,
    s3_key: str,
    user_id: str,
    image_bytes: bytes,
    classification,
) -> str:
    """Save image as a Prescription record. Returns 'done'."""
    async with _WorkerSession() as db:
        presc = Prescription(
            id=uuid.uuid4(),
            user_id=uuid.UUID(user_id),
            batch_id=uuid.UUID(batch_id),
            doc_type=DocType.RECIPE_107,
            doctor_name="Не определён",
            issue_date=datetime.now(timezone.utc).date(),
            expires_at=datetime.now(timezone.utc).date(),
            drug_name="Не распознано",
            drug_inn=None,
            risk_level=RiskLevel.STANDARD,
            status="active",
            s3_key=s3_key,
        )
        db.add(presc)
        await db.commit()
    return "done"


async def _save_unknown_receipt(batch_id: str, s3_key: str, user_id: str) -> str:
    """Save unknown file as a FAILED receipt."""
    async with _WorkerSession() as db:
        receipt = Receipt(
            id=uuid.uuid4(),
            user_id=uuid.UUID(user_id),
            s3_key=s3_key,
            ocr_status=OCRStatus.FAILED,
            batch_id=uuid.UUID(batch_id),
        )
        db.add(receipt)
        await db.commit()
    return "failed"


async def _autolink_prescriptions(
    db: AsyncSession,
    receipt: Receipt,
    batch_id: uuid.UUID,
    parsed,
) -> None:
    """Try to match rx items against prescriptions from the same batch."""
    try:
        from app.services.prescriptions.search_service import find_prescription

        items_result = await db.execute(
            select(ReceiptItem).where(ReceiptItem.receipt_id == receipt.id)
        )
        db_items = items_result.scalars().all()

        for db_item in db_items:
            if not db_item.is_rx:
                continue
            match = await find_prescription(
                user_id=receipt.user_id,
                drug_inn=db_item.drug_inn,
                drug_name=db_item.drug_name,
                purchase_date=receipt.purchase_date,
                db=db,
            )
            if match:
                db_item.prescription_id = match.prescription.id

        await db.commit()
    except Exception as exc:
        logger.warning("autolink_prescriptions failed for receipt %s: %s", receipt.id, exc)


async def _increment_counter(batch_id: str, file_status: str) -> None:
    """Atomically increment the appropriate counter on the batch_job."""
    col_map = {
        "done": BatchJob.done_count,
        "review": BatchJob.review_count,
        "failed": BatchJob.failed_count,
    }
    col = col_map.get(file_status)
    if col is None:
        col = BatchJob.failed_count

    async with _WorkerSession() as db:
        await db.execute(
            update(BatchJob)
            .where(BatchJob.id == uuid.UUID(batch_id))
            .values({col: col + 1})
        )
        await db.commit()


async def _maybe_complete_batch(batch_id: str) -> None:
    """Check if batch is done and mark it completed if so."""
    async with _WorkerSession() as db:
        batch = await _get_batch(db, batch_id)
        if batch is None:
            return
        processed = batch.done_count + batch.review_count + batch.failed_count
        if processed >= batch.total_files:
            batch.status = BatchStatus.COMPLETED if batch.failed_count == 0 else BatchStatus.PARTIAL
            batch.completed_at = datetime.now(timezone.utc)
            await db.commit()


async def _get_batch(db: AsyncSession, batch_id: str) -> BatchJob | None:
    result = await db.execute(
        select(BatchJob).where(BatchJob.id == uuid.UUID(batch_id))
    )
    return result.scalar_one_or_none()
