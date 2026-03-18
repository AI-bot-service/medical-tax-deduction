"""Prescription Dialog FSM (C-04).

ConversationHandler: PRESCRIPTION_DIALOG

Flow:
  Entry (via callback «Добавить рецепт» from receipt review)
  ↓
  WAITING_PRESCRIPTION_ACTION — InlineKeyboard:
    [📷 Загрузить фото] [✍️ Ввести вручную] [⏭ Позже]
  ↓ (branch on choice)
  WAITING_PRESCRIPTION_PHOTO → POST /prescriptions/{id}/photo → OCR → prefill
       OR
  MANUAL:
    ASK_DOCTOR       — «Введите ФИО врача»
    ASK_SPECIALTY    — «Специальность врача» (/skip)
    ASK_CLINIC       — «Название клиники» (/skip)
    ASK_ISSUE_DATE   — «Дата выписки (ДД.ММ.ГГГГ)», regex validation
    ASK_DRUG_NAME    — «Название препарата», top-3 ГРЛС + «Другое»
    ASK_DOSAGE       — «Дозировка» (/skip)
    ASK_EXPIRES_AT   — «Срок действия (ДД.ММ.ГГГГ или /skip)»
  ↓
  CONFIRM_PRESCRIPTION — summary card
    [✅ Сохранить] [✏️ Изменить] [❌ Отмена]
"""
from __future__ import annotations

import logging
import re
from typing import Any

from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Update,
)
from telegram.ext import (
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Conversation states
# ---------------------------------------------------------------------------

(
    WAITING_PRESCRIPTION_ACTION,
    WAITING_PRESCRIPTION_PHOTO,
    ASK_DOCTOR,
    ASK_SPECIALTY,
    ASK_CLINIC,
    ASK_ISSUE_DATE,
    ASK_DRUG_NAME,
    ASK_DOSAGE,
    ASK_EXPIRES_AT,
    CONFIRM_PRESCRIPTION,
) = range(10, 20)

# Callback data constants
_CB_UPLOAD_PHOTO = "rx_upload_photo"
_CB_MANUAL = "rx_manual"
_CB_LATER = "rx_later"
_CB_SAVE = "rx_save"
_CB_EDIT = "rx_edit"
_CB_CANCEL = "rx_cancel"

# user_data keys
_RX_KEY = "prescription_draft"          # dict with collected fields
_ITEM_ID_KEY = "prescription_item_id"  # receipt_item_id to link

# Date regex
_DATE_RE = re.compile(r"^\d{2}\.\d{2}\.\d{4}$")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _draft(context: ContextTypes.DEFAULT_TYPE) -> dict[str, Any]:
    if _RX_KEY not in context.user_data:  # type: ignore[operator]
        context.user_data[_RX_KEY] = {}  # type: ignore[index]
    return context.user_data[_RX_KEY]  # type: ignore[index]


def _rx_action_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("📷 Загрузить фото", callback_data=_CB_UPLOAD_PHOTO),
            InlineKeyboardButton("✍️ Ввести вручную", callback_data=_CB_MANUAL),
        ],
        [InlineKeyboardButton("⏭ Позже", callback_data=_CB_LATER)],
    ])


def _confirm_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ Сохранить", callback_data=_CB_SAVE),
            InlineKeyboardButton("✏️ Изменить", callback_data=_CB_EDIT),
        ],
        [InlineKeyboardButton("❌ Отмена", callback_data=_CB_CANCEL)],
    ])


def _draft_summary(draft: dict[str, Any]) -> str:
    lines = ["📋 *Данные рецепта:*"]
    lines.append(f"• Врач: {draft.get('doctor', '—')}")
    lines.append(f"• Специальность: {draft.get('specialty', '—')}")
    lines.append(f"• Клиника: {draft.get('clinic', '—')}")
    lines.append(f"• Дата выписки: {draft.get('issue_date', '—')}")
    lines.append(f"• Препарат: {draft.get('drug_name', '—')}")
    lines.append(f"• Дозировка: {draft.get('dosage', '—')}")
    lines.append(f"• Срок действия: {draft.get('expires_at', '—')}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def start_prescription_dialog(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    receipt_item_id: str | None = None,
) -> int:
    """Entry: ask user what to do with the prescription."""
    if receipt_item_id:
        context.user_data[_ITEM_ID_KEY] = receipt_item_id  # type: ignore[index]

    # Reset draft
    context.user_data[_RX_KEY] = {}  # type: ignore[index]

    text = (
        "💊 Для этого препарата нужен рецепт.\n"
        "Что хотите сделать?"
    )
    if update.callback_query:
        await update.callback_query.answer()
        await update.callback_query.edit_message_text(
            text, reply_markup=_rx_action_keyboard()
        )
    elif update.message:
        await update.message.reply_text(text, reply_markup=_rx_action_keyboard())

    return WAITING_PRESCRIPTION_ACTION


# ---------------------------------------------------------------------------
# WAITING_PRESCRIPTION_ACTION handlers
# ---------------------------------------------------------------------------


async def on_action_upload_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """User chose «Загрузить фото»."""
    q = update.callback_query
    await q.answer()
    await q.edit_message_text("📷 Пришлите фото рецепта.")
    return WAITING_PRESCRIPTION_PHOTO


async def on_action_manual(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """User chose «Ввести вручную»."""
    q = update.callback_query
    await q.answer()
    await q.edit_message_text("Введите ФИО врача, выписавшего рецепт:")
    return ASK_DOCTOR


async def on_action_later(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """User chose «Позже» — mark receipt as needs_prescription=true and end."""
    q = update.callback_query
    await q.answer()
    await q.edit_message_text(
        "⏭ Хорошо, можно добавить рецепт позже через меню чека."
    )
    context.user_data.pop(_RX_KEY, None)  # type: ignore[union-attr]
    return ConversationHandler.END


# ---------------------------------------------------------------------------
# WAITING_PRESCRIPTION_PHOTO
# ---------------------------------------------------------------------------


async def on_prescription_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Handle prescription photo — upload to backend for OCR."""
    message = update.message
    if not message or not message.photo:
        await message.reply_text("Пожалуйста, пришлите фото рецепта.")
        return WAITING_PRESCRIPTION_PHOTO

    photo = message.photo[-1]
    file = await photo.get_file()
    data = bytes(await file.download_as_bytearray())

    from handlers.conversations import _get_client

    client = _get_client(context)
    item_id = context.user_data.get(_ITEM_ID_KEY)  # type: ignore[union-attr]

    try:
        files = [("photo", (f"rx_{photo.file_id}.jpg", data, "image/jpeg"))]
        if item_id:
            resp = await client.post(
                f"/api/v1/prescriptions",
                files=files,
                data={"receipt_item_id": item_id},
            )
        else:
            resp = await client.post("/api/v1/prescriptions", files=files)

        if resp.status_code in (200, 201):
            await message.reply_text(
                "✅ Рецепт загружен и отправлен на распознавание.\n"
                "Я уточню детали, если нужно."
            )
        else:
            await message.reply_text("⚠️ Не удалось загрузить рецепт. Попробуйте ещё раз.")
    except Exception as exc:
        logger.error("Prescription photo upload failed: %s", exc)
        await message.reply_text("❌ Ошибка соединения. Попробуйте позже.")

    return ConversationHandler.END


# ---------------------------------------------------------------------------
# MANUAL INPUT states — 8 fields
# ---------------------------------------------------------------------------


async def on_doctor(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Collect doctor name."""
    text = (update.message.text or "").strip()
    if not text:
        await update.message.reply_text("Введите ФИО врача:")
        return ASK_DOCTOR
    _draft(context)["doctor"] = text
    await update.message.reply_text(
        "Специальность врача (или /skip):"
    )
    return ASK_SPECIALTY


async def on_specialty(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Collect doctor specialty (optional)."""
    text = (update.message.text or "").strip()
    if text != "/skip":
        _draft(context)["specialty"] = text
    await update.message.reply_text("Название клиники/больницы (или /skip):")
    return ASK_CLINIC


async def on_clinic(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Collect clinic name (optional)."""
    text = (update.message.text or "").strip()
    if text != "/skip":
        _draft(context)["clinic"] = text
    await update.message.reply_text(
        "Дата выписки рецепта (формат ДД.ММ.ГГГГ, например 15.03.2024):"
    )
    return ASK_ISSUE_DATE


async def on_issue_date(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Collect issue date with regex validation."""
    text = (update.message.text or "").strip()
    if not _DATE_RE.match(text):
        await update.message.reply_text(
            "Неверный формат. Введите дату в формате ДД.ММ.ГГГГ:"
        )
        return ASK_ISSUE_DATE
    _draft(context)["issue_date"] = text
    await update.message.reply_text("Название препарата (МНН или торговое название):")
    return ASK_DRUG_NAME


async def on_drug_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Collect drug name — try fuzzy GRLS match."""
    text = (update.message.text or "").strip()
    if not text:
        await update.message.reply_text("Введите название препарата:")
        return ASK_DRUG_NAME

    # Try fuzzy match against GRLS
    try:
        from app.services.ocr.drug_normalizer import get_drug_normalizer  # type: ignore
        normalizer = get_drug_normalizer()
        # Get top matches by trying variants
        match = normalizer.normalize(text)
        if match and match.match_score >= 80:
            _draft(context)["drug_name"] = match.drug_inn
            _draft(context)["drug_display"] = match.display_name
        else:
            _draft(context)["drug_name"] = text
            _draft(context)["drug_display"] = text
    except Exception:
        # Normalizer not available in bot context — use raw text
        _draft(context)["drug_name"] = text
        _draft(context)["drug_display"] = text

    await update.message.reply_text("Дозировка (например 500мг) или /skip:")
    return ASK_DOSAGE


async def on_dosage(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Collect dosage (optional)."""
    text = (update.message.text or "").strip()
    if text != "/skip":
        _draft(context)["dosage"] = text
    await update.message.reply_text(
        "Срок действия рецепта (ДД.ММ.ГГГГ) или /skip:"
    )
    return ASK_EXPIRES_AT


async def on_expires_at(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Collect expiry date (optional) — then show confirmation."""
    text = (update.message.text or "").strip()
    if text != "/skip":
        if not _DATE_RE.match(text):
            await update.message.reply_text(
                "Неверный формат. Введите ДД.ММ.ГГГГ или /skip:"
            )
            return ASK_EXPIRES_AT
        _draft(context)["expires_at"] = text

    draft = _draft(context)
    summary = _draft_summary(draft)
    await update.message.reply_text(
        f"{summary}\n\nСохранить рецепт?",
        parse_mode="Markdown",
        reply_markup=_confirm_keyboard(),
    )
    return CONFIRM_PRESCRIPTION


# ---------------------------------------------------------------------------
# CONFIRM_PRESCRIPTION handlers
# ---------------------------------------------------------------------------


async def on_confirm_save(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Save prescription via API."""
    q = update.callback_query
    await q.answer()

    draft = _draft(context)
    item_id = context.user_data.get(_ITEM_ID_KEY)  # type: ignore[union-attr]
    from handlers.conversations import _get_client

    client = _get_client(context)

    payload: dict[str, Any] = {
        "doctor_name": draft.get("doctor"),
        "doctor_specialty": draft.get("specialty"),
        "clinic_name": draft.get("clinic"),
        "issue_date": _parse_date(draft.get("issue_date")),
        "drug_name": draft.get("drug_display") or draft.get("drug_name"),
        "drug_inn": draft.get("drug_name"),
        "dosage": draft.get("dosage"),
        "expires_at": _parse_date(draft.get("expires_at")),
        "doc_type": "recipe_107",
    }
    if item_id:
        payload["receipt_item_id"] = item_id

    try:
        resp = await client.post("/api/v1/prescriptions", json=payload)
        if resp.status_code in (200, 201):
            await q.edit_message_text("✅ Рецепт сохранён!")
        else:
            await q.edit_message_text("⚠️ Не удалось сохранить. Попробуйте позже.")
    except Exception as exc:
        logger.error("Prescription save failed: %s", exc)
        await q.edit_message_text("❌ Ошибка соединения.")

    context.user_data.pop(_RX_KEY, None)  # type: ignore[union-attr]
    return ConversationHandler.END


async def on_confirm_edit(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """User wants to edit — restart from first manual field."""
    q = update.callback_query
    await q.answer()
    # Keep existing draft values (for re-editing)
    await q.edit_message_text("Введите ФИО врача:")
    return ASK_DOCTOR


async def on_confirm_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """User cancelled — discard draft."""
    q = update.callback_query
    await q.answer()
    await q.edit_message_text("❌ Добавление рецепта отменено.")
    context.user_data.pop(_RX_KEY, None)  # type: ignore[union-attr]
    return ConversationHandler.END


# ---------------------------------------------------------------------------
# Generic cancel command
# ---------------------------------------------------------------------------


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Handle /cancel command anywhere in the dialog."""
    context.user_data.pop(_RX_KEY, None)  # type: ignore[union-attr]
    await update.message.reply_text("❌ Добавление рецепта отменено.")
    return ConversationHandler.END


# ---------------------------------------------------------------------------
# Date parsing helper
# ---------------------------------------------------------------------------


def _parse_date(date_str: str | None) -> str | None:
    """Convert DD.MM.YYYY to YYYY-MM-DD for API."""
    if not date_str or not _DATE_RE.match(date_str):
        return None
    d, m, y = date_str.split(".")
    return f"{y}-{m}-{d}"


# ---------------------------------------------------------------------------
# ConversationHandler factory
# ---------------------------------------------------------------------------


def build_prescription_dialog_handler() -> ConversationHandler:
    """Build and return the PRESCRIPTION_DIALOG ConversationHandler."""
    return ConversationHandler(
        entry_points=[
            # Triggered by callback «rx_start» from receipt review
            CallbackQueryHandler(start_prescription_dialog, pattern="^rx_start$"),
        ],
        states={
            WAITING_PRESCRIPTION_ACTION: [
                CallbackQueryHandler(on_action_upload_photo, pattern=f"^{_CB_UPLOAD_PHOTO}$"),
                CallbackQueryHandler(on_action_manual, pattern=f"^{_CB_MANUAL}$"),
                CallbackQueryHandler(on_action_later, pattern=f"^{_CB_LATER}$"),
            ],
            WAITING_PRESCRIPTION_PHOTO: [
                MessageHandler(filters.PHOTO, on_prescription_photo),
            ],
            ASK_DOCTOR: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, on_doctor),
            ],
            ASK_SPECIALTY: [
                MessageHandler(filters.TEXT, on_specialty),
            ],
            ASK_CLINIC: [
                MessageHandler(filters.TEXT, on_clinic),
            ],
            ASK_ISSUE_DATE: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, on_issue_date),
            ],
            ASK_DRUG_NAME: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, on_drug_name),
            ],
            ASK_DOSAGE: [
                MessageHandler(filters.TEXT, on_dosage),
            ],
            ASK_EXPIRES_AT: [
                MessageHandler(filters.TEXT, on_expires_at),
            ],
            CONFIRM_PRESCRIPTION: [
                CallbackQueryHandler(on_confirm_save, pattern=f"^{_CB_SAVE}$"),
                CallbackQueryHandler(on_confirm_edit, pattern=f"^{_CB_EDIT}$"),
                CallbackQueryHandler(on_confirm_cancel, pattern=f"^{_CB_CANCEL}$"),
            ],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
        name="prescription_dialog",
    )
