import uuid

from sqlalchemy import BigInteger, Index, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.services.storage.encryption import EncryptedString


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("telegram_id", name="uq_users_telegram_id"),
        Index("ix_users_telegram_id", "telegram_id", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    telegram_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    phone_hash: Mapped[str | None] = mapped_column(String(72), nullable=True)
    telegram_username: Mapped[str | None] = mapped_column(String, nullable=True)

    # Personal data — encrypted with AES-256 (Fernet) at rest (152-ФЗ)
    full_name: Mapped[str | None] = mapped_column(EncryptedString(512), nullable=True)
    inn: Mapped[str | None] = mapped_column(EncryptedString(512), nullable=True)
    snils: Mapped[str | None] = mapped_column(EncryptedString(512), nullable=True)

    receipts: Mapped[list["Receipt"]] = relationship(  # noqa: F821
        "Receipt", back_populates="user", cascade="all, delete-orphan"
    )
    prescriptions: Mapped[list["Prescription"]] = relationship(  # noqa: F821
        "Prescription", back_populates="user", cascade="all, delete-orphan"
    )
