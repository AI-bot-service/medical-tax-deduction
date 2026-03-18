"""Export Task (H-01).

Celery task that:
1. Generates PDF registry via pdf_registry.py
2. Downloads receipt + prescription files from S3
3. Packages everything into a ZIP via zip_packager.py
4. Uploads ZIP to medvychet-exports bucket
5. Updates ExportJob status → done/failed
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models.export_job import ExportJob, ExportStatus
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)

_worker_engine = create_async_engine(
    settings.database_url_worker,
    pool_pre_ping=True,
    echo=False,
)
_WorkerSession = async_sessionmaker(_worker_engine, expire_on_commit=False)


@celery_app.task(name="workers.tasks.export_task.generate_export", bind=True, max_retries=2)
def generate_export(self, export_job_id: str, user_id: str, year: int) -> dict:
    """Celery task: build and upload ZIP export."""
    try:
        return asyncio.run(_run(export_job_id, user_id, year))
    except Exception as exc:
        logger.error("export_task failed [%s]: %s", export_job_id, exc)
        raise self.retry(exc=exc, countdown=60)


async def _run(export_job_id: str, user_id: str, year: int) -> dict:
    from app.services.export.zip_packager import build_zip, upload_zip

    async with _WorkerSession() as db:
        job = await _get_job(db, export_job_id)
        if job is None:
            logger.error("ExportJob %s not found", export_job_id)
            return {"status": "error", "reason": "job_not_found"}

        try:
            # Build ZIP in memory
            zip_bytes = await build_zip(uuid.UUID(user_id), year, db)

            # Upload to S3
            s3_key = await upload_zip(uuid.UUID(user_id), year, zip_bytes)

            # Mark as done
            job.status = ExportStatus.DONE
            job.s3_key = s3_key
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()

            logger.info("Export %s done: %s", export_job_id, s3_key)
            return {"status": "done", "s3_key": s3_key}

        except Exception as exc:
            logger.error("Export %s failed: %s", export_job_id, exc)
            job.status = ExportStatus.FAILED
            job.error = str(exc)[:500]
            job.completed_at = datetime.now(timezone.utc)
            await db.commit()
            raise


async def _get_job(db: AsyncSession, export_job_id: str) -> ExportJob | None:
    result = await db.execute(
        select(ExportJob).where(ExportJob.id == uuid.UUID(export_job_id))
    )
    return result.scalar_one_or_none()
