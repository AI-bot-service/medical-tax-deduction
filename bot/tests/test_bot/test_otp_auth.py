"""Tests for OTP Auth FSM (C-02).

Mocks PTB Update/Context objects and httpx transport.
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

from handlers.conversations import (  # noqa: E402
    WAITING_CONTACT,
    _get_client,
    cancel,
    receive_contact,
    start,
)
from telegram.ext import ConversationHandler  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_update(
    user_id: int = 12345,
    first_name: str = "Иван",
    username: str = "ivan",
    contact_phone: str | None = None,
    contact_user_id: int | None = None,
) -> MagicMock:
    """Build a minimal fake Update."""
    update = MagicMock()
    update.effective_user.id = user_id
    update.effective_user.first_name = first_name
    update.effective_user.username = username
    update.message.reply_text = AsyncMock()

    if contact_phone is not None:
        update.message.contact = MagicMock()
        update.message.contact.phone_number = contact_phone
        update.message.contact.user_id = contact_user_id if contact_user_id is not None else user_id
    else:
        update.message.contact = None

    return update


def _make_context(authenticated: bool = False) -> MagicMock:
    """Build a minimal fake Context with user_data."""
    context = MagicMock()
    context.user_data = {}

    if authenticated:
        from services.api_client import BackendClient

        client = BackendClient(base_url="http://test-backend")
        client.set_tokens("access_tok", "refresh_tok")
        context.user_data["api_client"] = client

    return context


def _resp(status: int, body: dict | None = None) -> httpx.Response:
    return httpx.Response(status, json=body or {})


# ---------------------------------------------------------------------------
# start() handler tests
# ---------------------------------------------------------------------------


class TestStartHandler:
    @pytest.mark.anyio
    async def test_new_user_returns_waiting_contact(self):
        """/start for unauthenticated user → WAITING_CONTACT state."""
        update = _make_update()
        context = _make_context(authenticated=False)

        result = await start(update, context)

        assert result == WAITING_CONTACT
        update.message.reply_text.assert_called_once()
        call_kwargs = update.message.reply_text.call_args
        # Should include a keyboard with contact button
        assert call_kwargs is not None

    @pytest.mark.anyio
    async def test_authenticated_user_returns_end(self):
        """/start for already-registered user → END (no contact request)."""
        update = _make_update()
        context = _make_context(authenticated=True)

        result = await start(update, context)

        assert result == ConversationHandler.END
        update.message.reply_text.assert_called_once()
        text = update.message.reply_text.call_args[0][0]
        assert "возвращением" in text.lower() or "welcome" in text.lower() or "Иван" in text

    @pytest.mark.anyio
    async def test_new_user_message_mentions_contact(self):
        """Prompt for new user should mention sharing contact."""
        update = _make_update()
        context = _make_context(authenticated=False)

        await start(update, context)

        text = update.message.reply_text.call_args[0][0]
        assert "контакт" in text.lower() or "contact" in text.lower() or "MedВычет" in text


# ---------------------------------------------------------------------------
# receive_contact() handler tests
# ---------------------------------------------------------------------------


class TestReceiveContact:
    @pytest.mark.anyio
    async def test_own_contact_registers_and_ends(self):
        """Valid own contact → POST bot-register → tokens stored → END."""
        update = _make_update(contact_phone="+79001234567", contact_user_id=12345)
        context = _make_context()

        # Inject a fake transport into the client
        from services.api_client import BackendClient

        client = BackendClient(base_url="http://test-backend")

        class _OkTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request):
                return httpx.Response(
                    200,
                    json={"access_token": "acc_tok", "refresh_token": "ref_tok", "token_type": "bearer"},
                )

        client._build_client = lambda: httpx.AsyncClient(
            base_url="http://test-backend",
            transport=_OkTransport(),
        )
        context.user_data["api_client"] = client

        result = await receive_contact(update, context)

        assert result == ConversationHandler.END
        assert client.is_authenticated
        assert client._cookies["access_token"] == "acc_tok"
        update.message.reply_text.assert_called_once()
        text = update.message.reply_text.call_args[0][0]
        assert "пожаловать" in text.lower() or "Добро" in text

    @pytest.mark.anyio
    async def test_foreign_contact_stays_in_waiting(self):
        """Contact belonging to another user → rejected, stays in WAITING_CONTACT."""
        update = _make_update(
            user_id=12345,
            contact_phone="+79001234567",
            contact_user_id=99999,  # different user
        )
        context = _make_context()

        result = await receive_contact(update, context)

        assert result == WAITING_CONTACT
        update.message.reply_text.assert_called_once()

    @pytest.mark.anyio
    async def test_backend_error_returns_end(self):
        """Backend error → friendly message → END (don't loop)."""
        update = _make_update(contact_phone="+79001234567", contact_user_id=12345)
        context = _make_context()

        from services.api_client import BackendClient

        client = BackendClient(base_url="http://test-backend")

        class _ErrTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request):
                raise httpx.ConnectError("refused")

        client._build_client = lambda: httpx.AsyncClient(
            base_url="http://test-backend",
            transport=_ErrTransport(),
        )
        context.user_data["api_client"] = client

        result = await receive_contact(update, context)

        assert result == ConversationHandler.END
        update.message.reply_text.assert_called_once()

    @pytest.mark.anyio
    async def test_backend_500_returns_end_not_authenticated(self):
        """Backend 500 → END, no tokens stored."""
        update = _make_update(contact_phone="+79001234567", contact_user_id=12345)
        context = _make_context()

        from services.api_client import BackendClient

        client = BackendClient(base_url="http://test-backend")

        class _ErrTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request):
                return httpx.Response(500, json={"detail": "Internal Error"})

        client._build_client = lambda: httpx.AsyncClient(
            base_url="http://test-backend",
            transport=_ErrTransport(),
        )
        context.user_data["api_client"] = client

        result = await receive_contact(update, context)

        assert result == ConversationHandler.END
        assert not client.is_authenticated

    @pytest.mark.anyio
    async def test_phone_without_plus_normalised(self):
        """Phone '79001234567' (no '+') → request sent with '+'."""
        update = _make_update(contact_phone="79001234567", contact_user_id=12345)
        context = _make_context()

        sent_phones: list[str] = []

        from services.api_client import BackendClient

        client = BackendClient(base_url="http://test-backend")

        class _CaptureTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request):
                import json as _json

                body = _json.loads(request.content)
                sent_phones.append(body.get("phone", ""))
                return httpx.Response(
                    200,
                    json={"access_token": "a", "refresh_token": "r", "token_type": "bearer"},
                )

        client._build_client = lambda: httpx.AsyncClient(
            base_url="http://test-backend",
            transport=_CaptureTransport(),
        )
        context.user_data["api_client"] = client

        await receive_contact(update, context)

        assert sent_phones and sent_phones[0].startswith("+")


# ---------------------------------------------------------------------------
# cancel() handler test
# ---------------------------------------------------------------------------


class TestCancelHandler:
    @pytest.mark.anyio
    async def test_cancel_returns_end(self):
        update = _make_update()
        context = _make_context()

        result = await cancel(update, context)

        assert result == ConversationHandler.END
        update.message.reply_text.assert_called_once()


# ---------------------------------------------------------------------------
# build_otp_auth_handler()
# ---------------------------------------------------------------------------


class TestBuildHandler:
    def test_handler_is_conversation_handler(self):
        from handlers.conversations import build_otp_auth_handler
        from telegram.ext import ConversationHandler

        handler = build_otp_auth_handler()
        assert isinstance(handler, ConversationHandler)

    def test_handler_has_start_entry_point(self):
        from handlers.conversations import build_otp_auth_handler
        from telegram.ext import CommandHandler

        handler = build_otp_auth_handler()
        assert any(isinstance(ep, CommandHandler) for ep in handler.entry_points)
