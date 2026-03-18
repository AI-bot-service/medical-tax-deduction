import uuid
from datetime import date as date_type

from sqlalchemy import Boolean, Date, Enum, Float, ForeignKey, Index, Numeric, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import OCRStatus


class Receipt(TimestampMixin, Base):
    __tablename__ = "receipts"
    __table_args__ = (
        Index("ix_receipts_purchase_date", "user_id", "purchase_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    s3_key: Mapped[str] = mapped_column(String, nullable=False)
    ocr_status: Mapped[OCRStatus] = mapped_column(
        Enum(OCRStatus, name="ocrstatus"), default=OCRStatus.PENDING, nullable=False
    )
    needs_prescription: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    purchase_date: Mapped[date_type | None] = mapped_column(Date, nullable=True)
    pharmacy_name: Mapped[str | None] = mapped_column(String, nullable=True)
    total_amount: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    ocr_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    merge_strategy: Mapped[str | None] = mapped_column(String, nullable=True)

    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("batch_jobs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    user: Mapped["User"] = relationship("User", back_populates="receipts")  # noqa: F821
    items: Mapped[list["ReceiptItem"]] = relationship(  # noqa: F821
        "ReceiptItem", back_populates="receipt", cascade="all, delete-orphan"
    )
    batch_job: Mapped["BatchJob | None"] = relationship(  # noqa: F821
        "BatchJob", back_populates="receipts", lazy="noload"
    )
