import uuid

from sqlalchemy import Boolean, Float, ForeignKey, Index, Numeric, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ReceiptItem(Base):
    __tablename__ = "receipt_items"
    __table_args__ = (
        Index("ix_receipt_items_drug", "drug_inn", "is_rx"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    receipt_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("receipts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    drug_name: Mapped[str] = mapped_column(String, nullable=False)
    drug_inn: Mapped[str | None] = mapped_column(String, nullable=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    total_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    is_rx: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    prescription_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("prescriptions.id", ondelete="SET NULL"),
        nullable=True,
    )

    receipt: Mapped["Receipt"] = relationship("Receipt", back_populates="items")  # noqa: F821
    prescription: Mapped["Prescription | None"] = relationship(  # noqa: F821
        "Prescription", back_populates="receipt_items"
    )
