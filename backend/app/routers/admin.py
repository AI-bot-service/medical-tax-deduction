"""Admin endpoints: S3 orphan analysis and cleanup."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_current_user, get_db
from app.services.storage.s3_client import (
    BUCKET_EXPORTS,
    BUCKET_PRESCRIPTIONS,
    BUCKET_RECEIPTS,
    S3Client,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class BucketStats(BaseModel):
    total: int
    linked: int
    orphan: int
    orphan_size_bytes: int


class S3AnalyzeResponse(BaseModel):
    buckets: dict[str, BucketStats]
    total_s3_objects: int
    total_linked: int
    total_orphans: int
    total_orphan_size_bytes: int


class S3PurgeResponse(BaseModel):
    deleted_count: int
    freed_bytes: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_admin(current_user) -> None:
    if not settings.admin_telegram_ids:
        raise HTTPException(status_code=403, detail="Доступ запрещён: не настроены администраторы")
    if current_user.telegram_id not in settings.admin_telegram_ids:
        raise HTTPException(status_code=403, detail="Доступ запрещён")


async def _get_db_keys(db: AsyncSession) -> set[str]:
    """Return all s3_key values currently stored in the database."""
    keys: set[str] = set()

    for query in (
        "SELECT s3_key FROM receipts",
        "SELECT s3_key FROM prescriptions WHERE s3_key IS NOT NULL",
        "SELECT s3_key FROM documents",
        "SELECT s3_key FROM export_jobs WHERE s3_key IS NOT NULL",
    ):
        result = await db.execute(text(query))
        for (key,) in result:
            keys.add(key)

    return keys


def _analyze_bucket(
    s3: S3Client, bucket: str, db_keys: set[str]
) -> tuple[BucketStats, list[tuple[str, int]]]:
    """Return stats and list of (orphan_key, size) for a bucket."""
    objects = s3.list_objects(bucket)
    orphans: list[tuple[str, int]] = [
        (obj["key"], obj["size"]) for obj in objects if obj["key"] not in db_keys
    ]
    linked = len(objects) - len(orphans)
    orphan_size = sum(size for _, size in orphans)
    stats = BucketStats(
        total=len(objects),
        linked=linked,
        orphan=len(orphans),
        orphan_size_bytes=orphan_size,
    )
    return stats, orphans


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/s3/analyze", response_model=S3AnalyzeResponse)
async def analyze_s3(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> S3AnalyzeResponse:
    """Scan all S3 buckets and return orphan statistics."""
    _require_admin(current_user)

    db_keys = await _get_db_keys(db)
    s3 = S3Client()

    buckets: dict[str, BucketStats] = {}
    for name, bucket in (
        ("receipts", BUCKET_RECEIPTS),
        ("prescriptions", BUCKET_PRESCRIPTIONS),
        ("exports", BUCKET_EXPORTS),
    ):
        stats, _ = _analyze_bucket(s3, bucket, db_keys)
        buckets[name] = stats

    total = sum(b.total for b in buckets.values())
    linked = sum(b.linked for b in buckets.values())
    orphans = sum(b.orphan for b in buckets.values())
    orphan_size = sum(b.orphan_size_bytes for b in buckets.values())

    return S3AnalyzeResponse(
        buckets=buckets,
        total_s3_objects=total,
        total_linked=linked,
        total_orphans=orphans,
        total_orphan_size_bytes=orphan_size,
    )


@router.post("/s3/purge", response_model=S3PurgeResponse)
async def purge_s3(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> S3PurgeResponse:
    """Delete all orphan S3 objects (not linked to any DB record)."""
    _require_admin(current_user)

    db_keys = await _get_db_keys(db)
    s3 = S3Client()

    deleted = 0
    freed = 0

    for bucket in (BUCKET_RECEIPTS, BUCKET_PRESCRIPTIONS, BUCKET_EXPORTS):
        _, orphans = _analyze_bucket(s3, bucket, db_keys)
        for key, size in orphans:
            try:
                s3.delete_object(bucket, key)
                deleted += 1
                freed += size
            except Exception as exc:
                logger.warning("Failed to delete orphan %s/%s: %s", bucket, key, exc)

    return S3PurgeResponse(deleted_count=deleted, freed_bytes=freed)
