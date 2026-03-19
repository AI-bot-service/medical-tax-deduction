"""Receipt Flow handlers for MedВычет bot (C-03).

Flow:
  User sends photo(s) / PDF document
  → files are buffered in user_data for 3 seconds (media group support)
  → after timeout: POST /api/v1/batch with all buffered files
  → «✅ Принял N файлов. Обрабатываю...»

Supports: JPEG, PNG, WEBP (as photo), PDF (as document).
"""
from __future__ import annotations

import io
import logging
from typing import Any

from telegram import Update
from telegram.ext import (
    ContextTypes,
    MessageHandler,
    filters,
)

from handlers.conversations import _get_client  # reuse per-user BackendClient

logger = logging.getLogger(__name__)

# user_data keys
_BUFFER_KEY = "receipt_buffer"        # list[dict] — {bytes, filename, content_type}
_JOB_KEY = "receipt_batch_job"        # current scheduled job name
_BATCH_DELAY = 3.0                    # seconds to wait after last file

_ALLOWED_DOC_MIME = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _buffer(context: ContextTypes.DEFAULT_TYPE) -> list[dict[str, Any]]:
    if _BUFFER_KEY not in context.user_data:  # type: ignore[operator]
        context.user_data[_BUFFER_KEY] = []  # type: ignore[index]
    return context.user_data[_BUFFER_KEY]  # type: ignore[index]


def _cancel_pending_job(context: ContextTypes.DEFAULT_TYPE) -> None:
    job_name = context.user_data.get(_JOB_KEY)  # type: ignore[union-attr]
    if job_name and context.job_queue:
        for job in context.job_queue.get_jobs_by_name(job_name):
            job.schedule_removal()


def _schedule_batch(context: ContextTypes.DEFAULT_TYPE, chat_id: int) -> None:
    """Cancel any existing timer and schedule a new 3-second batch job."""
    _cancel_pending_job(context)
    job_name = f"receipt_batch_{chat_id}"
    context.user_data[_JOB_KEY] = job_name  # type: ignore[index]
    if context.job_queue:
        context.job_queue.run_once(
            _process_batch,
            when=_BATCH_DELAY,
            chat_id=chat_id,
            name=job_name,
            data={"chat_id": chat_id},
        )


# ---------------------------------------------------------------------------
# Job callback — runs after 3-second idle
# ---------------------------------------------------------------------------


async def _process_batch(context: ContextTypes.DEFAULT_TYPE) -> None:
    """Job callback: send buffered files to backend batch API."""
    job = context.job
    chat_id: int = job.data["chat_id"]  # type: ignore[index]

    # Retrieve application for user_data access
    app = context.application
    user_data = app.user_data.get(chat_id, {})
    buf: list[dict[str, Any]] = user_data.pop(_BUFFER_KEY, [])
    user_data.pop(_JOB_KEY, None)

    if not buf:
        return

    n = len(buf)
    logger.info("Processing batch of %d files for chat_id=%s", n, chat_id)

    # Get BackendClient for this user (restores tokens from Redis if needed)
    from handlers.conversations import _get_client
    from services.api_client import BackendClient

    # Reconstruct a minimal context-like object to reuse _get_client
    class _FakeContext:
        user_data = user_data
        job_queue = None

    client: BackendClient = _get_client(_FakeContext(), telegram_id=chat_id)  # type: ignore[arg-type]

    try:
        files = [
            ("files", (item["filename"], io.BytesIO(item["bytes"]), item["content_type"]))
            for item in buf
        ]
        resp = await client.post("/api/v1/batch", files=files)

        if resp.status_code in (200, 201):
            await context.bot.send_message(
                chat_id=chat_id,
                text=f"✅ Принял {n} {'файл' if n == 1 else 'файла' if 2 <= n <= 4 else 'файлов'}. Обрабатываю...\n"
                     "Я пришлю результат, когда закончу.",
            )
        else:
            logger.warning("Batch API returned %s for chat_id=%s", resp.status_code, chat_id)
            await context.bot.send_message(
                chat_id=chat_id,
                text="⚠️ Не удалось отправить файлы на обработку. Попробуйте ещё раз.",
            )
    except Exception as exc:
        logger.error("Batch upload failed for chat_id=%s: %s", chat_id, exc)
        await context.bot.send_message(
            chat_id=chat_id,
            text="❌ Ошибка соединения с сервером. Попробуйте позже.",
        )


# ---------------------------------------------------------------------------
# Photo handler
# ---------------------------------------------------------------------------


async def on_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle incoming photo messages."""
    message = update.message
    if not message or not message.photo:
        return

    # Use highest-resolution photo
    photo = message.photo[-1]
    file = await photo.get_file()
    data = await file.download_as_bytearray()

    _buffer(context).append({
        "bytes": bytes(data),
        "filename": f"receipt_{photo.file_id}.jpg",
        "content_type": "image/jpeg",
    })

    _schedule_batch(context, message.chat_id)
    logger.debug("Buffered photo %s for chat_id=%s", photo.file_id, message.chat_id)


# ---------------------------------------------------------------------------
# Document handler
# ---------------------------------------------------------------------------


async def on_document(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle incoming document messages (PDF or image files)."""
    message = update.message
    if not message or not message.document:
        return

    doc = message.document
    mime = (doc.mime_type or "").lower()

    if mime not in _ALLOWED_DOC_MIME:
        await message.reply_text(
            "Пришли фото чека (JPG/PNG) или PDF. "
            "Другие форматы не поддерживаются."
        )
        return

    file = await doc.get_file()
    data = await file.download_as_bytearray()

    ext_map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "application/pdf": ".pdf",
    }
    ext = ext_map.get(mime, ".bin")
    filename = doc.file_name or f"receipt_{doc.file_id}{ext}"

    _buffer(context).append({
        "bytes": bytes(data),
        "filename": filename,
        "content_type": mime,
    })

    _schedule_batch(context, message.chat_id)
    logger.debug("Buffered document %s for chat_id=%s", doc.file_id, message.chat_id)


# ---------------------------------------------------------------------------
# Handler factories
# ---------------------------------------------------------------------------


def build_receipt_flow_handlers() -> list:
    """Return list of handlers for the receipt upload flow."""
    return [
        MessageHandler(filters.PHOTO, on_photo),
        MessageHandler(
            filters.Document.IMAGE | filters.Document.MimeType("application/pdf"),
            on_document,
        ),
    ]
