"""Сервис дедупликации рецептов.

Уникальность рецепта определяется по:
  (user_id, issue_date, doctor_name_normalized)

Нормализация doctor_name: нижний регистр + убираем лишние пробелы.

Результаты проверки:
  - UNIQUE: дублей нет, сохранять в БД
  - IDENTICAL: точный дубль (те же препараты), пропустить без сохранения
  - CONFLICT: рецепт с теми же реквизитами, но другим составом — нужна проверка оператора
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from enum import Enum

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prescription import Prescription
from app.services.ocr.pipeline import ParsedPrescription

logger = logging.getLogger(__name__)


class DuplicateKind(str, Enum):
    UNIQUE = "unique"
    IDENTICAL = "identical"
    CONFLICT = "conflict"


@dataclass
class PrescriptionDuplicateResult:
    kind: DuplicateKind
    existing_id: uuid.UUID | None = None


def _normalize_name(name: str | None) -> str:
    if not name:
        return ""
    return " ".join(name.strip().lower().split())


async def check_prescription_duplicate(
    db: AsyncSession,
    user_id: uuid.UUID,
    parsed: ParsedPrescription,
) -> PrescriptionDuplicateResult:
    """Проверить, есть ли в БД рецепт-дубль для данного распознанного результата.

    Поиск ведётся по (user_id, issue_date, doctor_name_normalized).
    """
    if parsed.issue_date is None or not parsed.doctor_name:
        # Без даты и врача нельзя проверить уникальность — пропускаем проверку
        return PrescriptionDuplicateResult(kind=DuplicateKind.UNIQUE)

    doctor_norm = _normalize_name(parsed.doctor_name)

    result = await db.execute(
        select(Prescription)
        .where(
            and_(
                Prescription.user_id == user_id,
                Prescription.issue_date == parsed.issue_date,
                func.lower(func.trim(Prescription.doctor_name)) == doctor_norm,
                Prescription.status != "deleted",
                Prescription.duplicate_of_id.is_(None),
            )
        )
        .limit(1)
    )
    existing = result.scalar_one_or_none()

    if existing is None:
        return PrescriptionDuplicateResult(kind=DuplicateKind.UNIQUE)

    logger.info(
        "prescription dedup: match issue_date=%s doctor=%r -> existing=%s",
        parsed.issue_date, parsed.doctor_name, existing.id,
    )

    if _prescriptions_are_identical(existing, parsed):
        logger.info("prescription dedup: IDENTICAL existing=%s", existing.id)
        return PrescriptionDuplicateResult(kind=DuplicateKind.IDENTICAL, existing_id=existing.id)

    logger.warning(
        "prescription dedup: CONFLICT existing=%s — состав отличается, отправляем на проверку",
        existing.id,
    )
    return PrescriptionDuplicateResult(kind=DuplicateKind.CONFLICT, existing_id=existing.id)


def _prescriptions_are_identical(existing: Prescription, parsed: ParsedPrescription) -> bool:
    """Сравнить препараты существующего рецепта с распознанным результатом.

    Считаем идентичными, если совпадает набор наименований препаратов (сортированный).
    Дополнительно проверяем дозировки, если они указаны.
    """
    existing_drugs = sorted(_normalize_name(item.drug_name) for item in existing.items)
    parsed_drugs = sorted(_normalize_name(d.drug_name_raw) for d in parsed.drugs)

    if existing_drugs != parsed_drugs:
        return False

    existing_dosages = {
        _normalize_name(item.drug_name): _normalize_name(item.dosage)
        for item in existing.items
    }
    for drug in parsed.drugs:
        norm_name = _normalize_name(drug.drug_name_raw)
        existing_dosage = existing_dosages.get(norm_name, "")
        parsed_dosage = _normalize_name(drug.dosage)
        if existing_dosage and parsed_dosage and existing_dosage != parsed_dosage:
            return False

    return True
