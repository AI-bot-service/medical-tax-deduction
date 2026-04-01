"""Batch Task (F-01).

Processes a single file within a batch job:
  1. Run OCR pipeline (process_image) — OpenAI Vision + QR scan
  2. Save Receipt + items if confidence sufficient
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
from app.models.enums import BatchStatus, OCRStatus
from app.models.receipt import Receipt
from app.models.receipt_item import ReceiptItem
from app.models.prescription import Prescription, PrescriptionItem
from app.services.dedup.receipt_dedup import DuplicateKind as ReceiptDuplicateKind, check_receipt_duplicate
from app.services.dedup.prescription_dedup import DuplicateKind as PrescriptionDuplicateKind, check_prescription_duplicate
from app.services.ocr.pipeline import CONFIDENCE_DONE, CONFIDENCE_REVIEW, ParsedPrescription, process_image
from app.services.storage.s3_client import BUCKET_RECEIPTS, S3Client
from workers.celery_app import celery_app
from workers.sse_publisher import publish_batch_event

logger = logging.getLogger(__name__)

_WorkerSession = None  # set per-task in _run()


def _make_session() -> tuple:
    """Create a fresh engine + session factory bound to the current event loop."""
    engine = create_async_engine(
        settings.database_url_worker,
        pool_pre_ping=True,
        pool_size=1,
        max_overflow=0,
        echo=False,
    )
    return engine, async_sessionmaker(engine, expire_on_commit=False)


@celery_app.task(name="workers.tasks.batch_task.process_batch_file", bind=True, max_retries=2)
def process_batch_file(
    self,
    batch_id: str,
    file_index: int,
    s3_key: str,
    user_id: str,
) -> dict:
    """Celery task: classify and process a single file in a batch."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(_run(batch_id, file_index, s3_key, user_id))
        return result
    except Exception as exc:
        logger.error("batch_task failed [%s #%d]: %s", batch_id, file_index, exc)
        raise self.retry(exc=exc, countdown=30)
    finally:
        loop.close()


async def _run(
    batch_id: str,
    file_index: int,
    s3_key: str,
    user_id: str,
) -> dict:
    global _WorkerSession
    _engine, _WorkerSession = _make_session()
    s3 = S3Client()

    # Download from S3
    try:
        image_bytes: bytes = s3.get_object(BUCKET_RECEIPTS, s3_key)
    except Exception as exc:
        logger.error("S3 download failed [%s #%d]: %s", batch_id, file_index, exc)
        await _increment_counter(batch_id, "failed")
        await _maybe_complete_batch(batch_id)
        return {"status": "failed", "reason": "s3_error"}

    # Run AI Vision pipeline — it detects document type automatically
    try:
        parsed = await process_image(image_bytes)
    except Exception as exc:
        logger.error("OCR pipeline failed [%s #%d]: %s", batch_id, file_index, exc)
        await _increment_counter(batch_id, "failed")
        await _maybe_complete_batch(batch_id)
        return {"status": "failed", "reason": "pipeline_error"}

    logger.info(
        "batch %s #%d: strategy=%s confidence=%.2f",
        batch_id, file_index, parsed.strategy, parsed.confidence,
    )

    file_status = "failed"

    if isinstance(parsed, ParsedPrescription):
        if parsed.confidence > 0:
            file_status = await _save_prescription_from_parsed(batch_id, s3_key, user_id, parsed)
        else:
            file_status = await _save_unknown_receipt(batch_id, s3_key, user_id)
    elif parsed.confidence > 0:
        file_status = await _save_receipt_from_parsed(
            batch_id, file_index, s3_key, user_id, parsed
        )
    else:
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
            batch.completed_at = datetime.utcnow()
            await db.commit()
            await _notify_telegram(batch, user_id)

    return {"status": file_status, "batch_id": batch_id}


async def _delete_receipt_and_s3(
    db: AsyncSession, receipt: Receipt, s3_key: str, reason: str
) -> None:
    """Delete receipt record from DB and its S3 file. FAILED receipts are not stored."""
    logger.warning("Deleting failed receipt %s (%s)", receipt.id, reason)
    try:
        S3Client().delete_object(BUCKET_RECEIPTS, s3_key)
    except Exception as exc:
        logger.error("S3 delete failed for %s: %s", s3_key, exc)
    await db.delete(receipt)
    await db.commit()


async def _save_receipt_from_parsed(
    batch_id: str,
    file_index: int,
    s3_key: str,
    user_id: str,
    parsed,
) -> str:
    """Save already-parsed receipt to DB. Returns 'done'/'review'/'failed'/'skipped'."""
    async with _WorkerSession() as db:
        # Проверка дубликата до создания записи
        dedup = await check_receipt_duplicate(db, uuid.UUID(user_id), parsed)

        if dedup.kind == ReceiptDuplicateKind.IDENTICAL:
            logger.info(
                "batch %s #%d: точный дубль чека existing=%s, пропускаем",
                batch_id, file_index, dedup.existing_id,
            )
            # Удаляем файл из S3 — дубль не нужен
            try:
                S3Client().delete_object(BUCKET_RECEIPTS, s3_key)
            except Exception as exc:
                logger.error("S3 delete failed for duplicate %s: %s", s3_key, exc)
            return "done"  # засчитываем как done для счётчика батча

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

        if parsed.confidence >= CONFIDENCE_REVIEW:
            file_status = "review"  # всегда REVIEW — оператор подтверждает
        else:
            await _delete_receipt_and_s3(
                db, receipt, s3_key,
                f"low_confidence={parsed.confidence:.2f} strategy={parsed.strategy}",
            )
            return "failed"

        # Все успешно распознанные чеки требуют подтверждения пользователем (REVIEW).
        # Статус DONE устанавливается только явно через PATCH /receipts/{id}.
        # Конфликтный дубль также идёт в REVIEW с пометкой duplicate_of_id.
        receipt.ocr_status = OCRStatus.REVIEW
        receipt.purchase_date = parsed.purchase_date
        receipt.pharmacy_name = parsed.pharmacy_name
        receipt.total_amount = float(parsed.total_amount) if parsed.total_amount is not None else None
        receipt.ocr_confidence = parsed.confidence
        receipt.merge_strategy = parsed.strategy
        receipt.fiscal_fn = parsed.fiscal_fn
        receipt.fiscal_fd = parsed.fiscal_fd
        receipt.fiscal_fp = parsed.fiscal_fp

        if dedup.kind == ReceiptDuplicateKind.CONFLICT:
            logger.warning(
                "batch %s #%d: дубль чека с другим составом existing=%s, отправляем оператору",
                batch_id, file_index, dedup.existing_id,
            )
            receipt.duplicate_of_id = dedup.existing_id
            file_status = "review"

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

        if has_rx:
            await _autolink_prescriptions(db, receipt, uuid.UUID(batch_id), parsed)

        return file_status


async def _save_prescription_from_parsed(
    batch_id: str,
    s3_key: str,
    user_id: str,
    parsed: ParsedPrescription,
) -> str:
    """Save OCR-detected prescription(s) to DB. One record per drug. Returns 'done'/'review'/'failed'."""
    if parsed.confidence < CONFIDENCE_REVIEW:
        await _save_unknown_receipt(batch_id, s3_key, user_id)
        return "failed"

    if not parsed.drugs or parsed.issue_date is None:
        await _save_unknown_receipt(batch_id, s3_key, user_id)
        return "failed"

    file_status = "review"  # всегда REVIEW — оператор подтверждает

    async with _WorkerSession() as db:
        # Проверка дубликата рецепта
        dedup = await check_prescription_duplicate(db, uuid.UUID(user_id), parsed)

        if dedup.kind == PrescriptionDuplicateKind.IDENTICAL:
            logger.info(
                "batch %s: точный дубль рецепта existing=%s, пропускаем",
                batch_id, dedup.existing_id,
            )
            try:
                S3Client().delete_object(BUCKET_RECEIPTS, s3_key)
            except Exception as exc:
                logger.error("S3 delete failed for duplicate prescription %s: %s", s3_key, exc)
            return "done"

        duplicate_of_id: uuid.UUID | None = None
        if dedup.kind == PrescriptionDuplicateKind.CONFLICT:
            logger.warning(
                "batch %s: дубль рецепта с другим составом existing=%s, отправляем оператору",
                batch_id, dedup.existing_id,
            )
            duplicate_of_id = dedup.existing_id
            file_status = "review"

        prescription = Prescription(
            id=uuid.uuid4(),
            user_id=uuid.UUID(user_id),
            doc_type=parsed.doc_type,
            doctor_name=parsed.doctor_name or "Не указан",
            clinic_name=parsed.clinic_name,
            issue_date=parsed.issue_date,
            expires_at=parsed.expires_at,
            s3_key=s3_key,
            batch_id=uuid.UUID(batch_id),
            status="active",
            duplicate_of_id=duplicate_of_id,
        )
        db.add(prescription)
        await db.flush()

        for drug in parsed.drugs:
            db.add(PrescriptionItem(
                prescription_id=prescription.id,
                drug_name=drug.drug_name_raw,
                drug_inn=drug.drug_inn,
                dosage=drug.dosage,
                is_rx=True,
            ))

        await db.commit()

    logger.info(
        "batch %s: saved %d prescription(s) confidence=%.2f",
        batch_id, len(parsed.drugs), parsed.confidence,
    )
    return file_status


async def _save_unknown_receipt(batch_id: str, s3_key: str, user_id: str) -> str:
    """Unknown file: delete from S3, do NOT create a DB record."""
    try:
        S3Client().delete_object(BUCKET_RECEIPTS, s3_key)
        logger.info("Deleted unclassified file from S3: %s", s3_key)
    except Exception as exc:
        logger.error("S3 delete failed for unclassified file %s: %s", s3_key, exc)
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
            batch.completed_at = datetime.utcnow()
            await db.commit()


async def _get_batch(db: AsyncSession, batch_id: str) -> BatchJob | None:
    result = await db.execute(
        select(BatchJob).where(BatchJob.id == uuid.UUID(batch_id))
    )
    return result.scalar_one_or_none()


async def _notify_telegram(batch: BatchJob, user_id: str) -> None:
    """Send batch completion notification to user via Telegram Bot API."""
    token = settings.telegram_bot_token
    if not token:
        return

    try:
        from app.models.user import User
        import httpx

        async with _WorkerSession() as db:
            result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
            user = result.scalar_one_or_none()
            if user is None:
                return
            chat_id = user.telegram_id

        total = batch.total_files
        done = batch.done_count
        review = batch.review_count
        failed = batch.failed_count

        if batch.status == BatchStatus.COMPLETED:
            header = f"✅ Обработка завершена — {total} {'чек' if total == 1 else 'чека' if 2 <= total <= 4 else 'чеков'}"
        else:
            header = f"⚠️ Обработка завершена с ошибками ({failed} из {total} не распознано)"

        lines = [header]
        if done:
            lines.append(f"✔️ Распознано: {done}")
        if review:
            lines.append(f"🔍 Требуют проверки: {review}")
        if failed:
            lines.append(f"❌ Не распознано: {failed}")
        if review or failed:
            lines.append("\nОткройте личный кабинет для проверки.")

        text = "\n".join(lines)

        async with httpx.AsyncClient(timeout=10) as http:
            await http.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text},
            )
    except Exception as exc:
        logger.warning("Failed to send Telegram notification for batch %s: %s", batch.id, exc)
