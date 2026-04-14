import uuid
from datetime import date as date_type, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Index, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import DocType, RiskLevel


class PrescriptionItem(Base):
    __tablename__ = "prescription_items"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    prescription_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("prescriptions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    drug_name: Mapped[str] = mapped_column(String, nullable=False)
    drug_inn: Mapped[str | None] = mapped_column(String, nullable=True)
    dosage: Mapped[str | None] = mapped_column(String, nullable=True)
    is_rx: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    prescription: Mapped["Prescription"] = relationship(
        "Prescription", back_populates="items"
    )


class Prescription(TimestampMixin, Base):
    __tablename__ = "prescriptions"
    __table_args__ = (
        Index("ix_prescriptions_user_date", "user_id", "issue_date", "expires_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    doc_type: Mapped[DocType] = mapped_column(
        Enum(DocType, name="doctype", values_callable=lambda x: [e.value for e in x]), nullable=False
    )
    doctor_name: Mapped[str] = mapped_column(String, nullable=False)
    doctor_specialty: Mapped[str | None] = mapped_column(String, nullable=True)
    clinic_name: Mapped[str | None] = mapped_column(String, nullable=True)
    issue_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    expires_at: Mapped[date_type] = mapped_column(Date, nullable=False)
    s3_key: Mapped[str | None] = mapped_column(String, nullable=True)
    risk_level: Mapped[RiskLevel] = mapped_column(
        Enum(RiskLevel, name="risklevel", values_callable=lambda x: [e.value for e in x]), default=RiskLevel.STANDARD, nullable=False
    )
    status: Mapped[str] = mapped_column(String, default="active", nullable=False)

    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("batch_jobs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Если не None — этот рецепт является дублем; нужна проверка оператором
    duplicate_of_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("prescriptions.id", ondelete="SET NULL"),
        nullable=True,
    )

    user: Mapped["User"] = relationship("User", back_populates="prescriptions")  # noqa: F821
    items: Mapped[list["PrescriptionItem"]] = relationship(
        "PrescriptionItem",
        back_populates="prescription",
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="PrescriptionItem.created_at",
    )
    receipt_items: Mapped[list["ReceiptItem"]] = relationship(  # noqa: F821
        "ReceiptItem", back_populates="prescription"
    )
    receipts: Mapped[list["Receipt"]] = relationship(  # noqa: F821
        "Receipt", back_populates="prescription", lazy="noload"
    )
    duplicate_of: Mapped["Prescription | None"] = relationship(  # noqa: F821
        "Prescription", remote_side="Prescription.id", foreign_keys=[duplicate_of_id], lazy="noload"
    )
