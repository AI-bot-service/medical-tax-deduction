"""Tests for bot commands: /help, /summary, /export (C-05)."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from handlers.commands import cmd_help, cmd_summary, cmd_export, _esc


# ---------------------------------------------------------------------------
# _esc helper
# ---------------------------------------------------------------------------


def test_esc_escapes_special_chars():
    assert _esc("1.5") == r"1\.5"
    assert _esc("hello_world") == r"hello\_world"
    assert _esc("100%") == r"100%"
    assert _esc("(2 чека)") == r"\(2 чека\)"


def test_esc_no_change_for_plain_text():
    assert _esc("hello") == "hello"
    assert _esc("12345") == "12345"


# ---------------------------------------------------------------------------
# /help
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cmd_help_sends_message():
    update = MagicMock()
    update.message.reply_text = AsyncMock()
    context = MagicMock()
    context.bot.username = "medvychet_bot"
    context.user_data = {}

    await cmd_help(update, context)

    update.message.reply_text.assert_called_once()
    call_kwargs = update.message.reply_text.call_args
    assert call_kwargs.kwargs["parse_mode"] == "MarkdownV2"
    text = call_kwargs.args[0]
    assert "/summary" in text
    assert "/export" in text
    assert "/help" in text


@pytest.mark.asyncio
async def test_cmd_help_includes_mini_app_button():
    update = MagicMock()
    update.message.reply_text = AsyncMock()
    context = MagicMock()
    context.bot.username = "medvychet_bot"
    context.user_data = {}

    await cmd_help(update, context)

    kb = update.message.reply_text.call_args.kwargs.get("reply_markup")
    assert kb is not None
    buttons = kb.inline_keyboard[0]
    assert any("t.me/medvychet_bot/app" in b.url for b in buttons)


@pytest.mark.asyncio
async def test_cmd_help_no_mini_app_button_without_username():
    update = MagicMock()
    update.message.reply_text = AsyncMock()
    context = MagicMock()
    context.bot.username = None
    context.user_data = {}

    await cmd_help(update, context)

    kb = update.message.reply_text.call_args.kwargs.get("reply_markup")
    assert kb is None


# ---------------------------------------------------------------------------
# /summary
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cmd_summary_not_authenticated():
    update = MagicMock()
    update.message.reply_text = AsyncMock()
    context = MagicMock()
    context.user_data = {}

    # fresh client is not authenticated
    await cmd_summary(update, context)

    update.message.reply_text.assert_called_once()
    text = update.message.reply_text.call_args.args[0]
    assert "авторизуйтесь" in text.lower() or "start" in text.lower()


@pytest.mark.asyncio
async def test_cmd_summary_formats_response():
    update = MagicMock()
    update.message.reply_text = AsyncMock()
    context = MagicMock()
    context.user_data = {}

    summary_data = {
        "year": 2024,
        "months": [
            {
                "month": "2024-01",
                "receipts_count": 3,
                "total_amount": "3500.00",
                "deduction_amount": "3500.00",
                "has_missing_prescriptions": False,
            },
            {
                "month": "2024-03",
                "receipts_count": 2,
                "total_amount": "8950.00",
                "deduction_amount": "8950.00",
                "has_missing_prescriptions": True,
            },
        ],
        "total_amount": "12450.00",
        "deduction_amount": "12450.00",
        "limit_used_pct": 8.3,
    }

    mock_client = MagicMock()
    mock_client.is_authenticated = True
    mock_client.get = AsyncMock(return_value=summary_data)
    context.user_data = {"api_client": mock_client}

    await cmd_summary(update, context)

    update.message.reply_text.assert_called_once()
    text = update.message.reply_text.call_args.args[0]
    assert "2024" in text
    assert "12" in text  # part of total 12450
    assert "MarkdownV2" == update.message.reply_text.call_args.kwargs["parse_mode"]


@pytest.mark.asyncio
async def test_cmd_summary_warning_for_missing_prescriptions():
    update = MagicMock()
    update.message.reply_text = AsyncMock()
    context = MagicMock()

    summary_data = {
        "year": 2024,
        "months": [
            {
                "month": "2024-01",
                "receipts_count": 1,
                "total_amount": "1000.00",
                "deduction_amount": "1000.00",
                "has_missing_prescriptions": True,
            }
        ],
        "total_amount": "1000.00",
        "deduction_amount": "1000.00",
        "limit_used_pct": 0.67,
    }

    mock_client = MagicMock()
    mock_client.is_authenticated = True
    mock_client.get = AsyncMock(return_value=summary_data)
    context.user_data = {"api_client": mock_client}
    context.bot.username = None

    await cmd_summary(update, context)

    text = update.message.reply_text.call_args.args[0]
    assert "⚠️" in text


@pytest.mark.asyncio
async def test_cmd_summary_api_error_sends_fallback():
    update = MagicMock()
    update.message.reply_text = AsyncMock()
    context = MagicMock()

    mock_client = MagicMock()
    mock_client.is_authenticated = True
    mock_client.get = AsyncMock(side_effect=Exception("network error"))
    context.user_data = {"api_client": mock_client}

    await cmd_summary(update, context)

    text = update.message.reply_text.call_args.args[0]
    assert "Не удалось" in text or "ошибк" in text.lower()


# ---------------------------------------------------------------------------
# /export
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cmd_export_not_authenticated():
    update = MagicMock()
    update.message.reply_text = AsyncMock()
    context = MagicMock()
    context.user_data = {}

    await cmd_export(update, context)

    update.message.reply_text.assert_called_once()
    text = update.message.reply_text.call_args.args[0]
    assert "авторизуйтесь" in text.lower() or "start" in text.lower()


@pytest.mark.asyncio
async def test_cmd_export_polls_and_sends_link():
    update = MagicMock()
    sent_msg = MagicMock()
    sent_msg.edit_text = AsyncMock()
    update.message.reply_text = AsyncMock(return_value=sent_msg)
    context = MagicMock()
    context.bot.username = "medvychet_bot"

    mock_client = MagicMock()
    mock_client.is_authenticated = True
    mock_client.post = AsyncMock(
        return_value={"export_id": "abc-123", "status": "processing", "year": 2024}
    )
    mock_client.get = AsyncMock(
        return_value={
            "export_id": "abc-123",
            "status": "done",
            "year": 2024,
            "download_url": "https://storage.example.com/abc.zip",
        }
    )
    context.user_data = {"api_client": mock_client}

    with patch("handlers.commands.asyncio.sleep", new_callable=AsyncMock):
        await cmd_export(update, context)

    sent_msg.edit_text.assert_called_once()
    edit_kwargs = sent_msg.edit_text.call_args
    text = edit_kwargs.args[0] if edit_kwargs.args else edit_kwargs.kwargs.get("text", "")
    kb = edit_kwargs.kwargs.get("reply_markup")
    # Should have inline download button
    assert kb is not None
    all_buttons = [b for row in kb.inline_keyboard for b in row]
    urls = [b.url for b in all_buttons if b.url]
    assert any("abc.zip" in u or "storage.example.com" in u for u in urls)


@pytest.mark.asyncio
async def test_cmd_export_failed_status():
    update = MagicMock()
    sent_msg = MagicMock()
    sent_msg.edit_text = AsyncMock()
    update.message.reply_text = AsyncMock(return_value=sent_msg)
    context = MagicMock()
    context.bot.username = None

    mock_client = MagicMock()
    mock_client.is_authenticated = True
    mock_client.post = AsyncMock(
        return_value={"export_id": "xyz", "status": "processing", "year": 2024}
    )
    mock_client.get = AsyncMock(
        return_value={"export_id": "xyz", "status": "failed", "year": 2024, "download_url": None}
    )
    context.user_data = {"api_client": mock_client}

    with patch("handlers.commands.asyncio.sleep", new_callable=AsyncMock):
        await cmd_export(update, context)

    text = sent_msg.edit_text.call_args.args[0]
    assert "❌" in text or "ошибк" in text.lower()
