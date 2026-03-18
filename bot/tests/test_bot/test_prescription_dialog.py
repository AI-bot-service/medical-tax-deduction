"""Tests for Prescription Dialog FSM (C-04).

Tests all branches of the prescription dialog:
  - action selection (photo/manual/later)
  - 8-state manual input flow
  - /skip on optional fields
  - /cancel command
  - date validation
  - confirm: save/edit/cancel
"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

# Ensure bot/ is on sys.path
_BOT_DIR = Path(__file__).parents[3]
if str(_BOT_DIR) not in sys.path:
    sys.path.insert(0, str(_BOT_DIR))

from handlers.prescription_dialog import (  # noqa: E402
    ASK_CLINIC,
    ASK_DOCTOR,
    ASK_DOSAGE,
    ASK_DRUG_NAME,
    ASK_EXPIRES_AT,
    ASK_ISSUE_DATE,
    ASK_SPECIALTY,
    CONFIRM_PRESCRIPTION,
    WAITING_PRESCRIPTION_ACTION,
    WAITING_PRESCRIPTION_PHOTO,
    _CB_CANCEL,
    _CB_EDIT,
    _CB_LATER,
    _CB_MANUAL,
    _CB_SAVE,
    _CB_UPLOAD_PHOTO,
    _RX_KEY,
    build_prescription_dialog_handler,
    cancel,
    on_action_later,
    on_action_manual,
    on_action_upload_photo,
    on_clinic,
    on_confirm_cancel,
    on_confirm_edit,
    on_confirm_save,
    on_doctor,
    on_dosage,
    on_drug_name,
    on_expires_at,
    on_issue_date,
    on_specialty,
    start_prescription_dialog,
)
from telegram.ext import ConversationHandler  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_message_update(text: str = "", user_id: int = 42) -> MagicMock:
    """Fake Update with a text message."""
    upd = MagicMock()
    upd.callback_query = None
    upd.message = MagicMock()
    upd.message.text = text
    upd.message.photo = None
    upd.message.reply_text = AsyncMock()
    upd.effective_user = MagicMock()
    upd.effective_user.id = user_id
    return upd


def _make_callback_update(data: str, user_id: int = 42) -> MagicMock:
    """Fake Update with a callback query."""
    upd = MagicMock()
    upd.message = None
    upd.callback_query = MagicMock()
    upd.callback_query.data = data
    upd.callback_query.answer = AsyncMock()
    upd.callback_query.edit_message_text = AsyncMock()
    upd.effective_user = MagicMock()
    upd.effective_user.id = user_id
    return upd


def _make_context(draft: dict | None = None) -> MagicMock:
    """Fake Context with user_data."""
    ctx = MagicMock()
    ctx.user_data = {}
    if draft is not None:
        ctx.user_data[_RX_KEY] = dict(draft)
    return ctx


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


class TestStartPrescriptionDialog:
    @pytest.mark.anyio
    async def test_start_via_message_sends_action_keyboard(self):
        upd = _make_message_update()
        ctx = _make_context()
        result = await start_prescription_dialog(upd, ctx)
        assert result == WAITING_PRESCRIPTION_ACTION
        upd.message.reply_text.assert_called_once()

    @pytest.mark.anyio
    async def test_start_via_callback_edits_message(self):
        upd = _make_callback_update("rx_start")
        ctx = _make_context()
        result = await start_prescription_dialog(upd, ctx)
        assert result == WAITING_PRESCRIPTION_ACTION
        upd.callback_query.edit_message_text.assert_called_once()

    @pytest.mark.anyio
    async def test_start_resets_draft(self):
        upd = _make_message_update()
        ctx = _make_context(draft={"doctor": "Old doctor"})
        await start_prescription_dialog(upd, ctx)
        assert ctx.user_data.get(_RX_KEY) == {}


# ---------------------------------------------------------------------------
# WAITING_PRESCRIPTION_ACTION
# ---------------------------------------------------------------------------


class TestActionCallbacks:
    @pytest.mark.anyio
    async def test_upload_photo_transitions_to_waiting_photo(self):
        upd = _make_callback_update(_CB_UPLOAD_PHOTO)
        ctx = _make_context()
        result = await on_action_upload_photo(upd, ctx)
        assert result == WAITING_PRESCRIPTION_PHOTO

    @pytest.mark.anyio
    async def test_manual_transitions_to_ask_doctor(self):
        upd = _make_callback_update(_CB_MANUAL)
        ctx = _make_context()
        result = await on_action_manual(upd, ctx)
        assert result == ASK_DOCTOR

    @pytest.mark.anyio
    async def test_later_ends_conversation(self):
        upd = _make_callback_update(_CB_LATER)
        ctx = _make_context()
        result = await on_action_later(upd, ctx)
        assert result == ConversationHandler.END

    @pytest.mark.anyio
    async def test_later_clears_draft(self):
        upd = _make_callback_update(_CB_LATER)
        ctx = _make_context(draft={"doctor": "Петров"})
        await on_action_later(upd, ctx)
        assert _RX_KEY not in ctx.user_data


# ---------------------------------------------------------------------------
# MANUAL: 8 states
# ---------------------------------------------------------------------------


class TestManualInputFlow:
    @pytest.mark.anyio
    async def test_doctor_saves_name_and_asks_specialty(self):
        upd = _make_message_update("Петров Иван Петрович")
        ctx = _make_context()
        result = await on_doctor(upd, ctx)
        assert result == ASK_SPECIALTY
        assert ctx.user_data[_RX_KEY]["doctor"] == "Петров Иван Петрович"

    @pytest.mark.anyio
    async def test_doctor_empty_stays_in_state(self):
        upd = _make_message_update("")
        ctx = _make_context()
        result = await on_doctor(upd, ctx)
        assert result == ASK_DOCTOR

    @pytest.mark.anyio
    async def test_specialty_skip_transitions_to_clinic(self):
        upd = _make_message_update("/skip")
        ctx = _make_context()
        result = await on_specialty(upd, ctx)
        assert result == ASK_CLINIC
        assert "specialty" not in ctx.user_data.get(_RX_KEY, {})

    @pytest.mark.anyio
    async def test_specialty_saved_and_transitions(self):
        upd = _make_message_update("Кардиология")
        ctx = _make_context()
        result = await on_specialty(upd, ctx)
        assert result == ASK_CLINIC
        assert ctx.user_data[_RX_KEY]["specialty"] == "Кардиология"

    @pytest.mark.anyio
    async def test_clinic_skip_transitions_to_issue_date(self):
        upd = _make_message_update("/skip")
        ctx = _make_context()
        result = await on_clinic(upd, ctx)
        assert result == ASK_ISSUE_DATE
        assert "clinic" not in ctx.user_data.get(_RX_KEY, {})

    @pytest.mark.anyio
    async def test_clinic_saved_and_transitions(self):
        upd = _make_message_update("ГКБ №1")
        ctx = _make_context()
        result = await on_clinic(upd, ctx)
        assert result == ASK_ISSUE_DATE
        assert ctx.user_data[_RX_KEY]["clinic"] == "ГКБ №1"

    @pytest.mark.anyio
    async def test_issue_date_valid_format(self):
        upd = _make_message_update("15.03.2024")
        ctx = _make_context()
        result = await on_issue_date(upd, ctx)
        assert result == ASK_DRUG_NAME
        assert ctx.user_data[_RX_KEY]["issue_date"] == "15.03.2024"

    @pytest.mark.anyio
    async def test_issue_date_invalid_format_stays(self):
        upd = _make_message_update("2024-03-15")
        ctx = _make_context()
        result = await on_issue_date(upd, ctx)
        assert result == ASK_ISSUE_DATE

    @pytest.mark.anyio
    async def test_issue_date_invalid_letters_stays(self):
        upd = _make_message_update("не дата")
        ctx = _make_context()
        result = await on_issue_date(upd, ctx)
        assert result == ASK_ISSUE_DATE

    @pytest.mark.anyio
    async def test_drug_name_saved(self):
        upd = _make_message_update("Ибупрофен")
        ctx = _make_context()
        result = await on_drug_name(upd, ctx)
        assert result == ASK_DOSAGE
        assert "drug_name" in ctx.user_data[_RX_KEY]

    @pytest.mark.anyio
    async def test_drug_name_empty_stays(self):
        upd = _make_message_update("")
        ctx = _make_context()
        result = await on_drug_name(upd, ctx)
        assert result == ASK_DRUG_NAME

    @pytest.mark.anyio
    async def test_dosage_skip_transitions_to_expires(self):
        upd = _make_message_update("/skip")
        ctx = _make_context()
        result = await on_dosage(upd, ctx)
        assert result == ASK_EXPIRES_AT
        assert "dosage" not in ctx.user_data.get(_RX_KEY, {})

    @pytest.mark.anyio
    async def test_dosage_saved_and_transitions(self):
        upd = _make_message_update("500мг")
        ctx = _make_context()
        result = await on_dosage(upd, ctx)
        assert result == ASK_EXPIRES_AT
        assert ctx.user_data[_RX_KEY]["dosage"] == "500мг"

    @pytest.mark.anyio
    async def test_expires_at_skip_shows_confirm(self):
        upd = _make_message_update("/skip")
        ctx = _make_context(draft={"doctor": "Петров", "issue_date": "01.01.2024", "drug_name": "ибупрофен"})
        result = await on_expires_at(upd, ctx)
        assert result == CONFIRM_PRESCRIPTION
        assert "expires_at" not in ctx.user_data.get(_RX_KEY, {})

    @pytest.mark.anyio
    async def test_expires_at_valid_date_shows_confirm(self):
        upd = _make_message_update("30.06.2024")
        ctx = _make_context(draft={"doctor": "Петров", "issue_date": "01.01.2024", "drug_name": "ибупрофен"})
        result = await on_expires_at(upd, ctx)
        assert result == CONFIRM_PRESCRIPTION
        assert ctx.user_data[_RX_KEY]["expires_at"] == "30.06.2024"

    @pytest.mark.anyio
    async def test_expires_at_invalid_format_stays(self):
        upd = _make_message_update("bad-date")
        ctx = _make_context()
        result = await on_expires_at(upd, ctx)
        assert result == ASK_EXPIRES_AT


# ---------------------------------------------------------------------------
# CONFIRM_PRESCRIPTION
# ---------------------------------------------------------------------------


class TestConfirmation:
    @pytest.mark.anyio
    async def test_save_calls_backend_and_ends(self):
        upd = _make_callback_update(_CB_SAVE)
        ctx = _make_context(draft={
            "doctor": "Петров И.И.",
            "issue_date": "15.03.2024",
            "drug_name": "ибупрофен",
            "drug_display": "Ибупрофен 400мг",
        })
        from services.api_client import BackendClient

        mock_client = MagicMock(spec=BackendClient)
        mock_client.post = AsyncMock(return_value=MagicMock(status_code=201))
        ctx.user_data["api_client"] = mock_client

        result = await on_confirm_save(upd, ctx)
        assert result == ConversationHandler.END
        mock_client.post.assert_called_once()

    @pytest.mark.anyio
    async def test_save_clears_draft(self):
        upd = _make_callback_update(_CB_SAVE)
        ctx = _make_context(draft={"doctor": "Петров"})
        from services.api_client import BackendClient

        mock_client = MagicMock(spec=BackendClient)
        mock_client.post = AsyncMock(return_value=MagicMock(status_code=201))
        ctx.user_data["api_client"] = mock_client

        await on_confirm_save(upd, ctx)
        assert _RX_KEY not in ctx.user_data

    @pytest.mark.anyio
    async def test_edit_goes_back_to_doctor(self):
        upd = _make_callback_update(_CB_EDIT)
        ctx = _make_context(draft={"doctor": "Старый Врач"})
        result = await on_confirm_edit(upd, ctx)
        assert result == ASK_DOCTOR

    @pytest.mark.anyio
    async def test_cancel_ends_conversation(self):
        upd = _make_callback_update(_CB_CANCEL)
        ctx = _make_context(draft={"doctor": "Петров"})
        result = await on_confirm_cancel(upd, ctx)
        assert result == ConversationHandler.END

    @pytest.mark.anyio
    async def test_cancel_clears_draft(self):
        upd = _make_callback_update(_CB_CANCEL)
        ctx = _make_context(draft={"doctor": "Петров"})
        await on_confirm_cancel(upd, ctx)
        assert _RX_KEY not in ctx.user_data


# ---------------------------------------------------------------------------
# /cancel command
# ---------------------------------------------------------------------------


class TestCancelCommand:
    @pytest.mark.anyio
    async def test_cancel_ends_conversation(self):
        upd = _make_message_update("/cancel")
        ctx = _make_context(draft={"doctor": "Петров"})
        result = await cancel(upd, ctx)
        assert result == ConversationHandler.END

    @pytest.mark.anyio
    async def test_cancel_clears_draft(self):
        upd = _make_message_update("/cancel")
        ctx = _make_context(draft={"doctor": "Петров"})
        await cancel(upd, ctx)
        assert _RX_KEY not in ctx.user_data


# ---------------------------------------------------------------------------
# Handler builder
# ---------------------------------------------------------------------------


class TestHandlerBuilder:
    def test_build_returns_conversation_handler(self):
        from telegram.ext import ConversationHandler as CH
        handler = build_prescription_dialog_handler()
        assert isinstance(handler, CH)

    def test_handler_has_correct_states(self):
        handler = build_prescription_dialog_handler()
        assert WAITING_PRESCRIPTION_ACTION in handler.states
        assert ASK_DOCTOR in handler.states
        assert CONFIRM_PRESCRIPTION in handler.states
