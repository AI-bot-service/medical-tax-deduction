"""Batch API Router (F-01).

Endpoints:
  POST /batch           — upload N files, create batch_job, enqueue N batch_task
  GET  /batch/{id}      — batch job status
  GET  /batch/{id}/stream — SSE stream for real-time progress
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db, get_redis
from app.models.batch_job import BatchJob
from app.models.enums import BatchSource, BatchStatus
from app.schemas.batch import BatchJobDetail, BatchJobResponse
from app.services.storage.s3_client import BUCKET_RECEIPTS, S3Client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/batch", tags=["batch"])

_ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
_ALLOWED_CONTENT_TYPES = {
    "image/jpeg", "image/png", "image/webp", "application/pdf"
}
_MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
_MAX_FILES_PER_BATCH = 20


def _ext_from_upload(file: UploadFile) -> str:
    if file.filename:
        return PurePosixPath(file.filename).suffix.lower()
    return ""


# ---------------------------------------------------------------------------
# POST /batch
# ---------------------------------------------------------------------------


@router.post("", response_model=BatchJobResponse, status_code=201)
async def create_batch(
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> BatchJobResponse:
    """Accept N files, create a BatchJob, enqueue batch_task for each file."""
    if not files:
        raise HTTPException(status_code=422, detail="Нужен хотя бы один файл")
    if len(files) > _MAX_FILES_PER_BATCH:
        raise HTTPException(
            status_code=422,
            detail=f"Максимум {_MAX_FILES_PER_BATCH} файлов в одной пачке",
        )

    # Create BatchJob
    batch = BatchJob(
        id=uuid.uuid4(),
        user_id=current_user.id,
        status=BatchStatus.PROCESSING,
        total_files=len(files),
        source=BatchSource.WEB,
    )
    db.add(batch)
    await db.commit()
    await db.refresh(batch)

    # Upload each file and enqueue task
    s3 = S3Client()
    for idx, file in enumerate(files):
        data = await file.read()
        if len(data) > _MAX_FILE_SIZE:
            logger.warning("File %d in batch %s exceeds 20MB — skipping", idx, batch.id)
            continue

        ext = _ext_from_upload(file)
        if ext not in _ALLOWED_EXTENSIONS:
            ext = ".jpg"

        s3_key = f"receipts/{current_user.id}/{batch.id}/{idx}{ext}"

        try:
            ct = (file.content_type or "image/jpeg").split(";")[0].strip()
            s3.upload_file(BUCKET_RECEIPTS, s3_key, data, ct)
        except Exception as exc:
            logger.error("S3 upload failed [batch %s #%d]: %s", batch.id, idx, exc)
            continue

        # Enqueue Celery task
        try:
            import sys
            _bt = sys.modules.get("workers.tasks.batch_task")
            if _bt is None:
                import importlib
                _bt = importlib.import_module("workers.tasks.batch_task")
            _bt.process_batch_file.delay(
                str(batch.id),
                idx,
                s3_key,
                str(current_user.id),
            )
        except Exception as exc:
            logger.warning("Failed to enqueue batch_task [%s #%d]: %s", batch.id, idx, exc)

    return BatchJobResponse(
        batch_id=batch.id,
        status=batch.status,
        total_files=batch.total_files,
        source=batch.source,
    )


# ---------------------------------------------------------------------------
# GET /batch/{id}
# ---------------------------------------------------------------------------


@router.get("/{batch_id}", response_model=BatchJobDetail)
async def get_batch(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> BatchJobDetail:
    result = await db.execute(
        select(BatchJob).where(
            BatchJob.id == batch_id,
            BatchJob.user_id == current_user.id,
        )
    )
    batch = result.scalar_one_or_none()
    if batch is None:
        raise HTTPException(status_code=404, detail="Batch не найден")

    return BatchJobDetail(
        batch_id=batch.id,
        status=batch.status,
        total_files=batch.total_files,
        done_count=batch.done_count,
        review_count=batch.review_count,
        failed_count=batch.failed_count,
        source=batch.source,
        created_at=batch.created_at,
        completed_at=batch.completed_at,
    )


# ---------------------------------------------------------------------------
# GET /batch/{id}/stream  — SSE
# ---------------------------------------------------------------------------


@router.get("/{batch_id}/stream")
async def stream_batch(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> StreamingResponse:
    """SSE stream for batch progress. Reads from Redis PubSub channel batch:{id}."""
    # Verify ownership
    result = await db.execute(
        select(BatchJob).where(
            BatchJob.id == batch_id,
            BatchJob.user_id == current_user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Batch не найден")

    redis = await get_redis()
    channel = f"batch:{batch_id}"

    async def event_generator():
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            heartbeat_interval = 15  # seconds
            last_heartbeat = asyncio.get_event_loop().time()

            async for message in pubsub.listen():
                now = asyncio.get_event_loop().time()

                # Heartbeat
                if now - last_heartbeat >= heartbeat_interval:
                    yield ": heartbeat\n\n"
                    last_heartbeat = now

                if message["type"] != "message":
                    continue

                data = message["data"]
                yield f"data: {data}\n\n"

                # Stop if batch is completed
                try:
                    payload = json.loads(data)
                    if payload.get("completed"):
                        break
                except Exception:
                    pass
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
