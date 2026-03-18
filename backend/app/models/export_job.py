"""ExportJob model (H-01)."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class ExportStatus:
    PENDING = "pending"
    DONE = "done"
    FAILED = "failed"


class ExportJob(TimestampMixin, Base):
    __tablename__ = "export_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=ExportStatus.PENDING
    )
    s3_key: Mapped[str | None] = mapped_column(String, nullable=True)
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)
