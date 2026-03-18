"""Batch API schemas (F-01)."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import BatchSource, BatchStatus


class BatchJobResponse(BaseModel):
    batch_id: uuid.UUID
    status: BatchStatus
    total_files: int
    source: BatchSource

    model_config = {"from_attributes": True}


class BatchJobDetail(BaseModel):
    batch_id: uuid.UUID
    status: BatchStatus
    total_files: int
    done_count: int
    review_count: int
    failed_count: int
    source: BatchSource
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}
