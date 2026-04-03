import uuid

from sqlalchemy import Enum, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import DocumentStatus, DocumentType


class Document(TimestampMixin, Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    doc_type: Mapped[DocumentType] = mapped_column(
        Enum(DocumentType, name="documenttype", values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    doc_status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus, name="documentstatus", values_callable=lambda x: [e.value for e in x]),
        default=DocumentStatus.UPLOADED,
        nullable=False,
    )
    tax_year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    s3_key: Mapped[str] = mapped_column(String, nullable=False)
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="documents")  # noqa: F821
