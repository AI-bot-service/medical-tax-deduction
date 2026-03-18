"""Export Router (H-01).

Endpoints:
  POST /export          — trigger export for given year, create ExportJob, enqueue Celery
  GET  /export/{id}     — get ExportJob status + presigned URL when ready
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.export_job import ExportJob, ExportStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/export", tags=["export"])


class ExportCreateResponse(BaseModel):
    export_id: uuid.UUID
    status: str
    year: int


class ExportStatusResponse(BaseModel):
    export_id: uuid.UUID
    status: str
    year: int
    download_url: str | None = None
    created_at: datetime
    completed_at: datetime | None = None


@router.post("", response_model=ExportCreateResponse, status_code=201)
async def create_export(
    year: int = Query(..., ge=2020, le=2100, description="Год для экспорта"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ExportCreateResponse:
    """Trigger a ZIP export for the given year. Returns ExportJob id."""
    job = ExportJob(
        id=uuid.uuid4(),
        user_id=current_user.id,
        year=year,
        status=ExportStatus.PENDING,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Enqueue Celery export task
    try:
        import sys
        _et = sys.modules.get("workers.tasks.export_task")
        if _et is None:
            import importlib
            _et = importlib.import_module("workers.tasks.export_task")
        _et.generate_export.delay(str(job.id), str(current_user.id), year)
    except Exception as exc:
        logger.warning("Failed to enqueue export_task for job %s: %s", job.id, exc)

    return ExportCreateResponse(
        export_id=job.id,
        status=job.status,
        year=job.year,
    )


@router.get("/{export_id}", response_model=ExportStatusResponse)
async def get_export(
    export_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ExportStatusResponse:
    """Return export status and presigned download URL when ready."""
    result = await db.execute(
        select(ExportJob).where(
            ExportJob.id == export_id,
            ExportJob.user_id == current_user.id,
        )
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="Экспорт не найден")

    download_url: str | None = None
    if job.status == ExportStatus.DONE and job.s3_key:
        try:
            from app.services.storage.s3_client import S3Client
            from app.services.export.zip_packager import BUCKET_EXPORTS

            s3 = S3Client()
            download_url = s3.generate_presigned_url(
                BUCKET_EXPORTS,
                job.s3_key,
                ttl=7 * 24 * 3600,  # 7 days
            )
        except Exception as exc:
            logger.warning("Failed to generate presigned URL for export %s: %s", export_id, exc)

    return ExportStatusResponse(
        export_id=job.id,
        status=job.status,
        year=job.year,
        download_url=download_url,
        created_at=job.created_at,
        completed_at=job.completed_at,
    )
