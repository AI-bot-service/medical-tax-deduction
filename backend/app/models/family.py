import uuid

from sqlalchemy import Enum, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import FamilyRole
from app.services.storage.encryption import EncryptedString


class FamilyMember(TimestampMixin, Base):
    """Член семьи пользователя (супруг или ребёнок)."""

    __tablename__ = "family_members"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    role: Mapped[FamilyRole] = mapped_column(
        Enum(FamilyRole, name="familyrole",
             values_callable=lambda x: [e.value for e in x]),
        nullable=False
    )
    # ФИО хранится в зашифрованном виде (152-ФЗ)
    full_name: Mapped[str | None] = mapped_column(EncryptedString(512), nullable=True)
    # Год рождения — для детей определяет право на вычет (до 18/24 лет)
    birth_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Если супруг тоже пользователь системы — связь для семейной оптимизации
    linked_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )

    user: Mapped["User"] = relationship(  # noqa: F821
        "User", back_populates="family_members", foreign_keys=[user_id]
    )
    linked_user: Mapped["User | None"] = relationship(  # noqa: F821
        "User", foreign_keys=[linked_user_id], lazy="noload"
    )
    expenses: Mapped[list["Expense"]] = relationship(  # noqa: F821
        "Expense", back_populates="child", lazy="noload"
    )
