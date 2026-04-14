import uuid

from sqlalchemy import ForeignKey, Integer, Numeric, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class IncomeRecord(TimestampMixin, Base):
    """Годовой доход пользователя для расчёта ставки НДФЛ."""

    __tablename__ = "income_records"
    __table_args__ = (
        UniqueConstraint("user_id", "tax_year", name="uq_income_user_year"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    tax_year: Mapped[int] = mapped_column(Integer, nullable=False)
    # Годовой доход — определяет ставку НДФЛ (особенно важно с 2025)
    annual_income: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    # Сумма фактически уплаченного налога (для проверки что возврат <= уплаченного)
    tax_paid: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="income_records")  # noqa: F821
