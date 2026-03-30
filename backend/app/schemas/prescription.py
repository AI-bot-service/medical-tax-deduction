"""Pydantic schemas for Prescriptions Router (E-03)."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.enums import DocType, RiskLevel

# doc_types that ФНС sometimes rejects → DISPUTED risk level
_DISPUTED_DOC_TYPES = {DocType.DOC_025, DocType.DOC_025_1}


class PrescriptionCreate(BaseModel):
    doc_type: DocType
    doctor_name: str
    doctor_specialty: str | None = None
    clinic_name: str | None = None
    issue_date: date
    expires_at: date | None = None  # default: issue_date + 60 days
    validity_days: int | None = None  # альтернатива expires_at: 60 или 365
    drug_name: str
    drug_inn: str | None = None
    dosage: str | None = None

    @model_validator(mode="after")
    def set_default_expires(self) -> "PrescriptionCreate":
        if self.expires_at is None:
            days = self.validity_days or 60
            self.expires_at = self.issue_date + timedelta(days=days)
        return self


class PrescriptionPatch(BaseModel):
    issue_date: date | None = None
    drug_name: str | None = None
    drug_inn: str | None = None
    dosage: str | None = None
    doctor_name: str | None = None
    clinic_name: str | None = None
    validity_days: int | None = None  # 60 или 365 → пересчитывает expires_at


class PrescriptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    doc_type: DocType
    doctor_name: str
    doctor_specialty: str | None = None
    clinic_name: str | None = None
    issue_date: date
    expires_at: date
    drug_name: str
    drug_inn: str | None = None
    dosage: str | None = None
    s3_key: str | None = None
    risk_level: RiskLevel
    status: str
    batch_id: uuid.UUID | None = None
    created_at: datetime


class PrescriptionListResponse(BaseModel):
    items: list[PrescriptionResponse]
    total: int


class LinkPrescriptionRequest(BaseModel):
    prescription_id: uuid.UUID
    receipt_item_id: uuid.UUID
