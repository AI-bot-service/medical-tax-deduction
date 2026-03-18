"""PDF Registry Generator (H-01).

Generates a ReportLab A4 PDF with a registry of pharmacy receipts for tax deduction
submission (ст. 219 НК РФ). Follows specification A.7.

8-column table:
  №  | Дата чека | Аптека | Наименование препарата | ИНН (МНН) | Кол-во | Сумма | № рецепта

Visual rules:
  - Monthly subtotals: light-blue row background
  - Rows without linked prescription: red № рецепта cell, footnote «*»
  - Year total + deduction calculation at the bottom
  - QR-code in the footer (link to the document or verification URL)
"""
from __future__ import annotations

import io
import logging
import uuid
from datetime import date
from decimal import Decimal

logger = logging.getLogger(__name__)

# ── ReportLab colours ─────────────────────────────────────────────────────────
try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        Image as RLImage,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    _BLUE_BG = colors.Color(0.8, 0.9, 1.0)
    _RED_BG = colors.Color(1.0, 0.8, 0.8)
    _HEADER_BG = colors.Color(0.2, 0.4, 0.7)
    _WHITE = colors.white
    _BLACK = colors.black
    _HAS_REPORTLAB = True
except ImportError:
    _HAS_REPORTLAB = False

_DEDUCTION_RATE = Decimal("0.13")
_DEDUCTION_LIMIT = Decimal("150000")


def _get_col_widths():
    """Return column widths (cm units). Deferred to avoid NameError when reportlab missing."""
    return [
        0.8 * cm,   # №
        2.0 * cm,   # Дата чека
        3.0 * cm,   # Аптека
        4.0 * cm,   # Наименование препарата
        2.5 * cm,   # МНН / ИНН
        1.2 * cm,   # Кол-во
        2.0 * cm,   # Сумма (руб.)
        2.5 * cm,   # № рецепта
    ]

_HEADERS = [
    "№", "Дата чека", "Аптека", "Наименование препарата",
    "МНН / ИНН", "Кол-во", "Сумма, руб.", "№ рецепта",
]


class RegistryRow:
    """One row of data for the registry table."""
    __slots__ = (
        "receipt_id", "purchase_date", "pharmacy_name", "drug_name",
        "drug_inn", "quantity", "total_price", "prescription_id",
    )

    def __init__(
        self,
        receipt_id: uuid.UUID,
        purchase_date: date | None,
        pharmacy_name: str | None,
        drug_name: str,
        drug_inn: str | None,
        quantity: float,
        total_price: float,
        prescription_id: uuid.UUID | None,
    ) -> None:
        self.receipt_id = receipt_id
        self.purchase_date = purchase_date
        self.pharmacy_name = pharmacy_name or "—"
        self.drug_name = drug_name
        self.drug_inn = drug_inn or "—"
        self.quantity = quantity
        self.total_price = total_price
        self.prescription_id = prescription_id


async def _fetch_rows(user_id: uuid.UUID, year: int, db) -> list[RegistryRow]:
    """Fetch all receipt items for the given user and year from the database."""
    from sqlalchemy import extract, select
    from sqlalchemy.orm import selectinload

    from app.models.enums import OCRStatus
    from app.models.receipt import Receipt
    from app.models.receipt_item import ReceiptItem

    stmt = (
        select(Receipt)
        .where(
            Receipt.user_id == user_id,
            extract("year", Receipt.created_at) == year,
            Receipt.ocr_status.in_([OCRStatus.DONE, OCRStatus.REVIEW]),
        )
        .options(selectinload(Receipt.items))
        .order_by(Receipt.created_at)
    )
    result = await db.execute(stmt)
    receipts = result.scalars().all()

    rows: list[RegistryRow] = []
    for receipt in receipts:
        for item in receipt.items:
            rows.append(
                RegistryRow(
                    receipt_id=receipt.id,
                    purchase_date=receipt.purchase_date,
                    pharmacy_name=receipt.pharmacy_name,
                    drug_name=item.drug_name or "—",
                    drug_inn=item.drug_inn,
                    quantity=item.quantity or 1.0,
                    total_price=item.total_price or 0.0,
                    prescription_id=getattr(item, "prescription_id", None),
                )
            )
    return rows


async def generate_registry(user_id: uuid.UUID, year: int, db) -> bytes:
    """Generate the tax deduction registry PDF.

    Args:
        user_id: UUID of the user
        year: calendar year for the registry
        db: async SQLAlchemy session

    Returns:
        PDF as bytes
    """
    if not _HAS_REPORTLAB:
        raise RuntimeError("reportlab is not installed")

    rows = await _fetch_rows(user_id, year, db)
    return _build_pdf(rows, year, str(user_id))


def _build_pdf(rows: list[RegistryRow], year: int, user_id: str) -> bytes:
    """Build and return PDF bytes from the registry rows."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "title", parent=styles["Heading1"], fontSize=14, spaceAfter=6
    )
    normal_style = ParagraphStyle(
        "normal_small", parent=styles["Normal"], fontSize=8
    )
    cell_style = ParagraphStyle(
        "cell", parent=styles["Normal"], fontSize=7, leading=9
    )

    story = []

    # ── Header ────────────────────────────────────────────────────────────────
    story.append(Paragraph(
        f"Реестр расходов на лекарственные препараты за {year} год",
        title_style,
    ))
    story.append(Paragraph(
        f"Пользователь: {user_id[:8]}…&nbsp;&nbsp;&nbsp;Дата формирования: {date.today()}",
        normal_style,
    ))
    story.append(Spacer(1, 0.3 * cm))

    # ── Build table data ──────────────────────────────────────────────────────
    table_data = [_HEADERS[:]]  # header row
    table_styles: list = [
        ("BACKGROUND", (0, 0), (-1, 0), _HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), _WHITE),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.Color(0.97, 0.97, 0.97)]),
    ]

    # Group rows by month for subtotals
    from collections import defaultdict

    monthly: dict[str, list[RegistryRow]] = defaultdict(list)
    for row in rows:
        month_key = (
            row.purchase_date.strftime("%Y-%m")
            if row.purchase_date else f"{year}-00"
        )
        monthly[month_key].append(row)

    row_idx = 1  # data starts at row 1 (0 = header)
    has_missing = False
    year_total = Decimal("0")
    footnote_needed = False

    for month_key in sorted(monthly.keys()):
        month_rows = monthly[month_key]
        month_total = Decimal("0")

        for seq, r in enumerate(month_rows, start=row_idx):
            missing = r.prescription_id is None
            if missing:
                footnote_needed = True
                has_missing = True
                rx_label = "*"
                table_styles.append(("BACKGROUND", (7, seq), (7, seq), _RED_BG))
            else:
                rx_label = str(r.prescription_id)[:8] + "…"

            table_data.append([
                str(seq - 0),  # reset seq inside loop below
                r.purchase_date.strftime("%d.%m.%Y") if r.purchase_date else "—",
                r.pharmacy_name[:20] if r.pharmacy_name else "—",
                r.drug_name[:30],
                r.drug_inn[:15] if r.drug_inn != "—" else "—",
                f"{r.quantity:.0f}",
                f"{r.total_price:.2f}",
                rx_label,
            ])
            month_total += Decimal(str(r.total_price))

        row_idx += len(month_rows)

        # Monthly subtotal row
        month_label = (
            date(int(month_key[:4]), int(month_key[5:7]), 1).strftime("%B %Y")
            if month_key[5:7] != "00" else f"{year}, дата неизвестна"
        )
        table_data.append([
            "", f"Итого {month_label}", "", "", "", "",
            f"{month_total:.2f}", "",
        ])
        table_styles.extend([
            ("BACKGROUND", (0, row_idx), (-1, row_idx), _BLUE_BG),
            ("FONTNAME", (0, row_idx), (-1, row_idx), "Helvetica-Bold"),
            ("SPAN", (1, row_idx), (5, row_idx)),
        ])
        row_idx += 1
        year_total += month_total

    # Renumber rows (fix seq after grouping)
    seq_num = 1
    for i in range(1, len(table_data)):
        if table_data[i][0] not in ("", " "):
            try:
                table_data[i][0] = str(seq_num)
                seq_num += 1
            except (IndexError, TypeError):
                pass

    # ── Year total row ────────────────────────────────────────────────────────
    deduction = min(year_total, _DEDUCTION_LIMIT) * _DEDUCTION_RATE
    table_data.append([
        "", "ИТОГО за год", "", "", "", "",
        f"{year_total:.2f}", "",
    ])
    table_styles.extend([
        ("BACKGROUND", (0, row_idx), (-1, row_idx), colors.Color(0.7, 0.85, 0.7)),
        ("FONTNAME", (0, row_idx), (-1, row_idx), "Helvetica-Bold"),
        ("SPAN", (1, row_idx), (5, row_idx)),
    ])

    table = Table(table_data, colWidths=_get_col_widths(), repeatRows=1)
    table.setStyle(TableStyle(table_styles))
    story.append(table)

    # ── Deduction summary ─────────────────────────────────────────────────────
    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph(
        f"<b>Итого расходов:</b> {year_total:.2f} руб.<br/>"
        f"<b>Налоговый вычет (13%):</b> {deduction:.2f} руб.<br/>"
        f"<b>Лимит использован:</b> {min(float(year_total / _DEDUCTION_LIMIT) * 100, 100):.1f}%",
        normal_style,
    ))

    if footnote_needed:
        story.append(Spacer(1, 0.3 * cm))
        story.append(Paragraph(
            "* — рецепт не прикреплён. Расходы могут не быть приняты налоговым органом.",
            ParagraphStyle("footnote", parent=styles["Normal"], fontSize=7, textColor=colors.red),
        ))

    # ── QR-code footer ────────────────────────────────────────────────────────
    try:
        import qrcode

        qr = qrcode.QRCode(version=1, box_size=3, border=2)
        qr.add_data(f"https://medvychet.ru/verify?user={user_id[:8]}&year={year}")
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white")
        qr_buf = io.BytesIO()
        qr_img.save(qr_buf, format="PNG")
        qr_buf.seek(0)
        story.append(Spacer(1, 0.5 * cm))
        story.append(RLImage(qr_buf, width=2 * cm, height=2 * cm))
        story.append(Paragraph(
            f"QR-код для верификации: medvychet.ru/verify?user={user_id[:8]}&amp;year={year}",
            ParagraphStyle("qr_caption", parent=styles["Normal"], fontSize=6),
        ))
    except ImportError:
        logger.debug("qrcode not available — QR footer skipped")

    doc.build(story)
    buf.seek(0)
    return buf.read()
