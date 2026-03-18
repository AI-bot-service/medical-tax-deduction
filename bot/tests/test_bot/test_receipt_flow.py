"""Tests for Receipt Flow handlers (C-03).

Tests the file buffering logic, format validation, and batch API call.
Uses mock Telegram objects and httpx transport.
"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

_BOT_DIR = Path(__file__).parents[3]
if str(_BOT_DIR) not in sys.path:
    sys.path.insert(0, str(_BOT_DIR))

from handlers.receipt_flow import (  # noqa: E402
    _ALLOWED_DOC_MIME,
    _BUFFER_KEY,
    _JOB_KEY,
    _buffer,
    _cancel_pending_job,
    _process_batch,
    _schedule_batch,
    on_document,
    on_photo,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

FAKE_JPEG = b"\xff\xd8\xff" + b"\x00" * 50


def _make_context(chat_id: int = 12345, authenticated: bool = True) -> MagicMock:
    ctx = MagicMock()
    ctx.user_data = {}
    ctx.job_queue = MagicMock()
    ctx.job_queue.get_jobs_by_name.return_value = []

    if authenticated:
        from services.api_client import BackendClient
        client = BackendClient(base_url="http://test-backend")
        client.set_tokens("acc", "ref")
        ctx.user_data["api_client"] = client

    return ctx


def _make_photo_update(chat_id: int = 12345) -> MagicMock:
    update = MagicMock()
    update.message.chat_id = chat_id
    update.message.reply_text = AsyncMock()

    # Fake photo with get_file
    photo = MagicMock()
    photo.file_id = "photo_abc"
    fake_file = MagicMock()
    fake_file.download_as_bytearray = AsyncMock(return_value=bytearray(FAKE_JPEG))
    photo.get_file = AsyncMock(return_value=fake_file)
    update.message.photo = [photo]  # list; on_photo uses [-1]

    return update


def _make_doc_update(
    mime: str = "application/pdf",
    filename: str = "receipt.pdf",
    chat_id: int = 12345,
) -> MagicMock:
    update = MagicMock()
    update.message.chat_id = chat_id
    update.message.reply_text = AsyncMock()
    update.message.photo = None

    doc = MagicMock()
    doc.file_id = "doc_xyz"
    doc.mime_type = mime
    doc.file_name = filename
    fake_file = MagicMock()
    fake_file.download_as_bytearray = AsyncMock(return_value=bytearray(b"%PDF-1.4"))
    doc.get_file = AsyncMock(return_value=fake_file)
    update.message.document = doc

    return update


# ---------------------------------------------------------------------------
# Buffer helpers
# ---------------------------------------------------------------------------


class TestBufferHelpers:
    def test_buffer_initialises_empty(self):
        ctx = _make_context()
        buf = _buffer(ctx)
        assert buf == []

    def test_buffer_returns_same_list(self):
        ctx = _make_context()
        buf1 = _buffer(ctx)
        buf1.append("x")
        buf2 = _buffer(ctx)
        assert buf2 == ["x"]

    def test_cancel_pending_job_removes_job(self):
        ctx = _make_context()
        job = MagicMock()
        ctx.job_queue.get_jobs_by_name.return_value = [job]
        ctx.user_data[_JOB_KEY] = "some_job"

        _cancel_pending_job(ctx)

        job.schedule_removal.assert_called_once()

    def test_schedule_batch_stores_job_name(self):
        ctx = _make_context()
        _schedule_batch(ctx, chat_id=42)
        assert ctx.user_data.get(_JOB_KEY) == "receipt_batch_42"

    def test_schedule_batch_calls_run_once(self):
        ctx = _make_context()
        _schedule_batch(ctx, chat_id=42)
        ctx.job_queue.run_once.assert_called_once()


# ---------------------------------------------------------------------------
# on_photo
# ---------------------------------------------------------------------------


class TestOnPhoto:
    @pytest.mark.anyio
    async def test_photo_added_to_buffer(self):
        update = _make_photo_update()
        ctx = _make_context()

        await on_photo(update, ctx)

        buf = ctx.user_data[_BUFFER_KEY]
        assert len(buf) == 1
        assert buf[0]["content_type"] == "image/jpeg"
        assert buf[0]["bytes"] == FAKE_JPEG

    @pytest.mark.anyio
    async def test_multiple_photos_accumulated(self):
        update = _make_photo_update()
        ctx = _make_context()

        await on_photo(update, ctx)
        await on_photo(update, ctx)

        assert len(ctx.user_data[_BUFFER_KEY]) == 2

    @pytest.mark.anyio
    async def test_photo_schedules_job(self):
        update = _make_photo_update()
        ctx = _make_context()

        await on_photo(update, ctx)

        ctx.job_queue.run_once.assert_called_once()


# ---------------------------------------------------------------------------
# on_document
# ---------------------------------------------------------------------------


class TestOnDocument:
    @pytest.mark.anyio
    async def test_pdf_added_to_buffer(self):
        update = _make_doc_update(mime="application/pdf")
        ctx = _make_context()

        await on_document(update, ctx)

        buf = ctx.user_data[_BUFFER_KEY]
        assert len(buf) == 1
        assert buf[0]["content_type"] == "application/pdf"

    @pytest.mark.anyio
    async def test_jpeg_document_accepted(self):
        update = _make_doc_update(mime="image/jpeg", filename="photo.jpg")
        ctx = _make_context()

        await on_document(update, ctx)

        assert len(ctx.user_data[_BUFFER_KEY]) == 1

    @pytest.mark.anyio
    async def test_unsupported_mime_sends_error(self):
        update = _make_doc_update(mime="application/zip", filename="archive.zip")
        ctx = _make_context()

        await on_document(update, ctx)

        update.message.reply_text.assert_called_once()
        text = update.message.reply_text.call_args[0][0]
        assert "JPG" in text or "PDF" in text
        # Nothing buffered
        assert ctx.user_data.get(_BUFFER_KEY, []) == []

    @pytest.mark.anyio
    async def test_unsupported_mime_does_not_schedule_job(self):
        update = _make_doc_update(mime="video/mp4", filename="video.mp4")
        ctx = _make_context()

        await on_document(update, ctx)

        ctx.job_queue.run_once.assert_not_called()


# ---------------------------------------------------------------------------
# _process_batch (job callback)
# ---------------------------------------------------------------------------


class TestProcessBatch:
    def _make_job_context(self, chat_id: int, buf: list, authenticated: bool = True) -> MagicMock:
        from services.api_client import BackendClient

        client = BackendClient(base_url="http://test-backend")
        if authenticated:
            client.set_tokens("acc", "ref")

        user_data = {_BUFFER_KEY: buf, "api_client": client}

        ctx = MagicMock()
        ctx.job = MagicMock()
        ctx.job.data = {"chat_id": chat_id}
        ctx.application = MagicMock()
        ctx.application.user_data = {chat_id: user_data}
        ctx.bot = MagicMock()
        ctx.bot.send_message = AsyncMock()
        return ctx, client

    @pytest.mark.anyio
    async def test_empty_buffer_is_noop(self):
        ctx, client = self._make_job_context(chat_id=1, buf=[])
        ctx.application.user_data[1] = {}

        await _process_batch(ctx)

        ctx.bot.send_message.assert_not_called()

    @pytest.mark.anyio
    async def test_successful_batch_sends_confirmation(self):
        buf = [{"bytes": FAKE_JPEG, "filename": "r.jpg", "content_type": "image/jpeg"}]
        ctx, client = self._make_job_context(chat_id=1, buf=buf)

        class _OkTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, req):
                return httpx.Response(201, json={"batch_id": "abc"})

        client._build_client = lambda: httpx.AsyncClient(
            base_url="http://test-backend", transport=_OkTransport()
        )

        await _process_batch(ctx)

        ctx.bot.send_message.assert_called_once()
        text = ctx.bot.send_message.call_args[1]["text"]
        assert "1" in text and ("файл" in text or "Принял" in text)

    @pytest.mark.anyio
    async def test_three_files_sends_plural(self):
        buf = [
            {"bytes": FAKE_JPEG, "filename": f"r{i}.jpg", "content_type": "image/jpeg"}
            for i in range(3)
        ]
        ctx, client = self._make_job_context(chat_id=1, buf=buf)

        class _OkTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, req):
                return httpx.Response(201, json={"batch_id": "xyz"})

        client._build_client = lambda: httpx.AsyncClient(
            base_url="http://test-backend", transport=_OkTransport()
        )

        await _process_batch(ctx)

        text = ctx.bot.send_message.call_args[1]["text"]
        assert "3" in text

    @pytest.mark.anyio
    async def test_backend_error_sends_warning(self):
        buf = [{"bytes": FAKE_JPEG, "filename": "r.jpg", "content_type": "image/jpeg"}]
        ctx, client = self._make_job_context(chat_id=1, buf=buf)

        class _ErrTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, req):
                return httpx.Response(500, json={"detail": "error"})

        client._build_client = lambda: httpx.AsyncClient(
            base_url="http://test-backend", transport=_ErrTransport()
        )

        await _process_batch(ctx)

        ctx.bot.send_message.assert_called_once()
        text = ctx.bot.send_message.call_args[1]["text"]
        assert "⚠️" in text or "Не удалось" in text

    @pytest.mark.anyio
    async def test_network_error_sends_error_message(self):
        buf = [{"bytes": FAKE_JPEG, "filename": "r.jpg", "content_type": "image/jpeg"}]
        ctx, client = self._make_job_context(chat_id=1, buf=buf)

        class _FailTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, req):
                raise httpx.ConnectError("no connection")

        client._build_client = lambda: httpx.AsyncClient(
            base_url="http://test-backend", transport=_FailTransport()
        )

        await _process_batch(ctx)

        ctx.bot.send_message.assert_called_once()
        text = ctx.bot.send_message.call_args[1]["text"]
        assert "❌" in text or "Ошибка" in text

    @pytest.mark.anyio
    async def test_buffer_cleared_after_processing(self):
        buf = [{"bytes": FAKE_JPEG, "filename": "r.jpg", "content_type": "image/jpeg"}]
        ctx, client = self._make_job_context(chat_id=1, buf=buf)

        class _OkTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, req):
                return httpx.Response(201, json={"batch_id": "abc"})

        client._build_client = lambda: httpx.AsyncClient(
            base_url="http://test-backend", transport=_OkTransport()
        )

        await _process_batch(ctx)

        # Buffer should be gone from user_data
        user_data = ctx.application.user_data[1]
        assert _BUFFER_KEY not in user_data


# ---------------------------------------------------------------------------
# build_receipt_flow_handlers
# ---------------------------------------------------------------------------


class TestBuildHandlers:
    def test_returns_two_handlers(self):
        from handlers.receipt_flow import build_receipt_flow_handlers
        from telegram.ext import MessageHandler

        handlers = build_receipt_flow_handlers()
        assert len(handlers) == 2
        assert all(isinstance(h, MessageHandler) for h in handlers)
