"""BatchJob model (A-06)."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, SmallInteger, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import BatchSource, BatchStatus


class BatchJob(TimestampMixin, Base):
    __tablename__ = "batch_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[BatchStatus] = mapped_column(
        Enum(BatchStatus, name="batchstatus", values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=BatchStatus.PROCESSING,
    )
    total_files: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    done_count: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    review_count: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    failed_count: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    source: Mapped[BatchSource] = mapped_column(
        Enum(BatchSource, name="batchsource", values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)

    # Relationships
    receipts: Mapped[list] = relationship("Receipt", back_populates="batch_job", lazy="noload")
