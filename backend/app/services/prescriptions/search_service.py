"""Prescription Search Service (E-04).

Finds a matching prescription for an rx receipt item using 4 levels:

  L1 — exact INN match via prescription_items, purchase date within prescription validity period
  L2 — exact INN match via prescription_items, prescription expired ≤ 30 days before purchase
  L3 — fuzzy drug_name match (rapidfuzz WRatio ≥ 85) among active prescription_items
  L4 — no match → return None

Called from workers/tasks/ocr_task.py after OCR for each is_rx=True item.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prescription import Prescription, PrescriptionItem

logger = logging.getLogger(__name__)

_L2_MAX_OVERDUE_DAYS = 30
_L3_FUZZY_THRESHOLD = 85


@dataclass
class PrescriptionSearchResult:
    prescription: Prescription
    match_level: str          # "L1" | "L2" | "L3"
    days_overdue: int | None  # None for L1; positive int for L2; None for L3
    confidence_score: float   # 1.0 for L1, 0.85 for L2, normalised WRatio/100 for L3


async def find_prescription(
    user_id,
    drug_inn: str | None,
    drug_name: str,
    purchase_date: date | None,
    db: AsyncSession,
) -> PrescriptionSearchResult | None:
    """Search for a matching prescription using L1→L2→L3→L4 strategy.

    Args:
        user_id: UUID of the receipt owner
        drug_inn: normalised INN from DrugNormalizer (may be None)
        drug_name: raw drug name from receipt (used for L3 fuzzy search)
        purchase_date: date of the receipt purchase (may be None → skip L1/L2)
        db: async SQLAlchemy session

    Returns:
        PrescriptionSearchResult or None (L4)
    """

    # ── L1: exact INN + purchase date inside validity window ──────────────────
    if drug_inn and purchase_date:
        stmt = (
            select(Prescription)
            .join(PrescriptionItem, PrescriptionItem.prescription_id == Prescription.id)
            .where(
                and_(
                    Prescription.user_id == user_id,
                    PrescriptionItem.drug_inn == drug_inn,
                    Prescription.issue_date <= purchase_date,
                    Prescription.expires_at >= purchase_date,
                    Prescription.status != "deleted",
                )
            )
        )
        result = await db.execute(stmt)
        match = result.scalars().first()
        if match:
            logger.debug("L1 match for drug_inn=%s on %s: prescription %s", drug_inn, purchase_date, match.id)
            return PrescriptionSearchResult(
                prescription=match,
                match_level="L1",
                days_overdue=None,
                confidence_score=1.0,
            )

    # ── L2: exact INN, expired ≤ 30 days before purchase ─────────────────────
    if drug_inn and purchase_date:
        cutoff = purchase_date - timedelta(days=_L2_MAX_OVERDUE_DAYS)
        stmt = (
            select(Prescription)
            .join(PrescriptionItem, PrescriptionItem.prescription_id == Prescription.id)
            .where(
                and_(
                    Prescription.user_id == user_id,
                    PrescriptionItem.drug_inn == drug_inn,
                    Prescription.expires_at >= cutoff,
                    Prescription.expires_at < purchase_date,
                    Prescription.status != "deleted",
                )
            )
        )
        result = await db.execute(stmt)
        match = result.scalars().first()
        if match:
            days_overdue = (purchase_date - match.expires_at).days
            logger.debug(
                "L2 match for drug_inn=%s, overdue=%d days: prescription %s",
                drug_inn, days_overdue, match.id,
            )
            return PrescriptionSearchResult(
                prescription=match,
                match_level="L2",
                days_overdue=days_overdue,
                confidence_score=0.85,
            )

    # ── L3: fuzzy drug_name match (rapidfuzz WRatio ≥ 85) ────────────────────
    try:
        from rapidfuzz import fuzz

        stmt = (
            select(PrescriptionItem, Prescription)
            .join(Prescription, Prescription.id == PrescriptionItem.prescription_id)
            .where(
                and_(
                    Prescription.user_id == user_id,
                    Prescription.status != "deleted",
                )
            )
        )
        result = await db.execute(stmt)
        rows = result.all()

        best_presc: Prescription | None = None
        best_score = 0.0

        for item, presc in rows:
            score = fuzz.WRatio(drug_name.lower(), item.drug_name.lower())
            if score >= _L3_FUZZY_THRESHOLD and score > best_score:
                best_score = score
                best_presc = presc

        if best_presc is not None:
            logger.debug(
                "L3 fuzzy match for '%s' → prescription %s (score=%.1f)",
                drug_name, best_presc.id, best_score,
            )
            return PrescriptionSearchResult(
                prescription=best_presc,
                match_level="L3",
                days_overdue=None,
                confidence_score=round(best_score / 100.0, 3),
            )
    except ImportError:
        logger.warning("rapidfuzz not available — L3 search skipped")

    # ── L4: no match ──────────────────────────────────────────────────────────
    return None
