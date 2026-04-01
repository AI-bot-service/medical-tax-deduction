"""Pydantic schemas for Receipts Router (E-01)."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import OCRStatus


# ---------------------------------------------------------------------------
# Shared sub-schemas
# ---------------------------------------------------------------------------


class ReceiptItemSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    drug_name: str
    drug_inn: str | None = None
    quantity: float
    unit_price: Decimal
    total_price: Decimal
    is_rx: bool
    prescription_id: uuid.UUID | None = None


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------


class ReceiptUploadResponse(BaseModel):
    receipt_id: uuid.UUID
    status: OCRStatus
    message: str = "Чек принят в обработку"


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


class ReceiptListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ocr_status: OCRStatus
    purchase_date: date | None = None
    pharmacy_name: str | None = None
    total_amount: Decimal | None = None
    ocr_confidence: float | None = None
    needs_prescription: bool
    created_at: datetime


class MonthGroup(BaseModel):
    month: str  # "2024-03"
    total_amount: Decimal
    receipts: list[ReceiptListItem]


class ReceiptListResponse(BaseModel):
    months: list[MonthGroup]
    total_count: int


# ---------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------


class ReceiptDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ocr_status: OCRStatus
    purchase_date: date | None = None
    pharmacy_name: str | None = None
    total_amount: Decimal | None = None
    ocr_confidence: float | None = None
    merge_strategy: str | None = None
    needs_prescription: bool
    fiscal_fn: str | None = None
    fiscal_fd: str | None = None
    duplicate_of_id: uuid.UUID | None = None
    image_url: str | None = None  # presigned URL, injected after DB fetch
    items: list[ReceiptItemSchema] = Field(default_factory=list)
    created_at: datetime


# ---------------------------------------------------------------------------
# Patch
# ---------------------------------------------------------------------------


class ReceiptItemPatch(BaseModel):
    id: uuid.UUID
    drug_name: str | None = None
    drug_inn: str | None = None
    quantity: float | None = None
    unit_price: Decimal | None = None
    total_price: Decimal | None = None
    is_rx: bool | None = None


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------


class MonthSummary(BaseModel):
    month: str  # "2024-01"
    receipts_count: int
    total_amount: Decimal
    deduction_amount: Decimal
    has_missing_prescriptions: bool


class SummaryResponse(BaseModel):
    year: int
    months: list[MonthSummary]
    total_amount: Decimal
    deduction_amount: Decimal
    limit_used_pct: float  # capped at 100.0


class ReceiptPatch(BaseModel):
    purchase_date: date | None = None
    pharmacy_name: str | None = None
    total_amount: Decimal | None = None
    items: list[ReceiptItemPatch] | None = None


class ReceiptResolveDuplicate(BaseModel):
    """Тело запроса POST /receipts/{id}/resolve-duplicate."""

    purchase_date: date | None = None
    pharmacy_name: str | None = None
    total_amount: Decimal | None = None
    fiscal_fn: str | None = None
    fiscal_fd: str | None = None
    items: list[ReceiptItemPatch] | None = None
