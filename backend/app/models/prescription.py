import uuid
from datetime import date as date_type

from sqlalchemy import Date, Enum, ForeignKey, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import DocType, RiskLevel


class Prescription(TimestampMixin, Base):
    __tablename__ = "prescriptions"
    __table_args__ = (
        Index("ix_prescriptions_search", "user_id", "drug_inn", "issue_date", "expires_at"),
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
        Enum(DocType, name="doctype"), nullable=False
    )
    doctor_name: Mapped[str] = mapped_column(String, nullable=False)
    doctor_specialty: Mapped[str | None] = mapped_column(String, nullable=True)
    clinic_name: Mapped[str | None] = mapped_column(String, nullable=True)
    issue_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    expires_at: Mapped[date_type] = mapped_column(Date, nullable=False)
    drug_name: Mapped[str] = mapped_column(String, nullable=False)
    drug_inn: Mapped[str | None] = mapped_column(String, nullable=True)
    dosage: Mapped[str | None] = mapped_column(String, nullable=True)
    s3_key: Mapped[str | None] = mapped_column(String, nullable=True)
    risk_level: Mapped[RiskLevel] = mapped_column(
        Enum(RiskLevel, name="risklevel"), default=RiskLevel.STANDARD, nullable=False
    )
    status: Mapped[str] = mapped_column(String, default="active", nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="prescriptions")  # noqa: F821
    receipt_items: Mapped[list["ReceiptItem"]] = relationship(  # noqa: F821
        "ReceiptItem", back_populates="prescription"
    )
