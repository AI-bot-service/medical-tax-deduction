import uuid

from sqlalchemy import Enum, ForeignKey, Index, Integer, Numeric, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import ExpenseCategory


class Expense(TimestampMixin, Base):
    """Расход пользователя для расчёта социального налогового вычета."""

    __tablename__ = "expenses"
    __table_args__ = (
        Index("ix_expenses_user_year", "user_id", "tax_year"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    category: Mapped[ExpenseCategory] = mapped_column(
        Enum(ExpenseCategory, name="expensecategory",
             values_callable=lambda x: [e.value for e in x]),
        nullable=False
    )
    tax_year: Mapped[int] = mapped_column(Integer, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Для обучения ребёнка — идентификатор ребёнка (отдельный лимит на ребёнка)
    child_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("family_members.id", ondelete="SET NULL"),
        nullable=True
    )

    # Привязка к чеку (если расход создан автоматически из чека лекарств)
    receipt_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("receipts.id", ondelete="SET NULL"),
        nullable=True
    )

    # Ключ документа-основания в S3 (справка КНД, договор и т.д.)
    document_s3_key: Mapped[str | None] = mapped_column(String, nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="expenses")  # noqa: F821
    receipt: Mapped["Receipt | None"] = relationship("Receipt", lazy="noload")  # noqa: F821
    child: Mapped["FamilyMember | None"] = relationship("FamilyMember", lazy="noload")  # noqa: F821
