"""Conversation handlers for MedВычет bot (C-02).

OTP_AUTH ConversationHandler:
  /start (new user) → ReplyKeyboard «Поделиться контактом» → WAITING_CONTACT
             → POST /auth/bot-register → JWT в cookie jar → «Добро пожаловать!»
  /start (returning user, already has tokens) → приветствие, пропуск шага контакта
"""
from __future__ import annotations

import logging

from telegram import (
    KeyboardButton,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
    Update,
)
from telegram.ext import (
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

from services.api_client import BackendClient
from services.token_storage import delete_tokens, load_tokens, save_tokens

logger = logging.getLogger(__name__)

# ── Conversation states ───────────────────────────────────────────────────────
WAITING_CONTACT = 1

# ── User-data key for the per-user BackendClient ─────────────────────────────
_CLIENT_KEY = "api_client"


def _get_client(context: ContextTypes.DEFAULT_TYPE, telegram_id: int | None = None) -> BackendClient:
    """Return or create a per-user BackendClient stored in user_data.

    If the client is not authenticated and telegram_id is provided,
    tries to restore tokens from Redis (survives bot restarts).
    """
    if _CLIENT_KEY not in context.user_data:  # type: ignore[operator]
        context.user_data[_CLIENT_KEY] = BackendClient()  # type: ignore[index]
    client: BackendClient = context.user_data[_CLIENT_KEY]  # type: ignore[index]
    if not client.is_authenticated and telegram_id is not None:
        tokens = load_tokens(telegram_id)
        if tokens:
            client.set_tokens(*tokens)
            logger.debug("Restored tokens from Redis for telegram_id=%s", telegram_id)
    return client


# ── Handler functions ─────────────────────────────────────────────────────────


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Entry point: /start command.

    - Returning authenticated user → welcome without asking for contact.
    - New / unauthenticated user → show contact-share button.
    """
    user = update.effective_user
    client = _get_client(context, telegram_id=user.id if user else None)

    if client.is_authenticated:
        name = user.first_name if user else "друг"
        await update.message.reply_text(  # type: ignore[union-attr]
            f"С возвращением, {name}! 👋\n"
            "Отправьте фото чека, чтобы начать обработку.",
            reply_markup=ReplyKeyboardRemove(),
        )
        return ConversationHandler.END

    # First-time user: request phone via contact button
    keyboard = ReplyKeyboardMarkup(
        [[KeyboardButton("📱 Поделиться контактом", request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )
    await update.message.reply_text(  # type: ignore[union-attr]
        "Добро пожаловать в MedВычет! 💊\n\n"
        "Я помогу вам получить налоговый вычет за лекарства.\n"
        "Для начала — поделитесь контактом для авторизации:",
        reply_markup=keyboard,
    )
    return WAITING_CONTACT


async def receive_contact(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """WAITING_CONTACT: user shares their contact → register via backend."""
    contact = update.message.contact  # type: ignore[union-attr]
    user = update.effective_user

    # Security: only accept the user's own contact
    if contact is None or contact.user_id != (user.id if user else None):
        await update.message.reply_text(  # type: ignore[union-attr]
            "Пожалуйста, поделитесь именно своим контактом с помощью кнопки ниже."
        )
        return WAITING_CONTACT

    phone = contact.phone_number
    # Normalise: ensure leading +
    if not phone.startswith("+"):
        phone = "+" + phone

    client = _get_client(context, telegram_id=user.id if user else None)

    try:
        resp = await client.post(
            "/api/v1/auth/bot-register",
            json={
                "telegram_id": user.id,
                "phone": phone,
                "username": user.username,
            },
        )
    except Exception as exc:
        logger.error("bot-register request failed: %s", exc)
        await update.message.reply_text(  # type: ignore[union-attr]
            "Не удалось подключиться к серверу. Попробуйте позже.",
            reply_markup=ReplyKeyboardRemove(),
        )
        return ConversationHandler.END

    if resp.status_code == 200:
        data = resp.json()
        client.set_tokens(data["access_token"], data["refresh_token"])
        if user:
            save_tokens(user.id, data["access_token"], data["refresh_token"])

        name = user.first_name or "друг"
        await update.message.reply_text(  # type: ignore[union-attr]
            f"Добро пожаловать, {name}! 🎉\n\n"
            "Теперь просто отправьте фото аптечного чека — "
            "я распознаю препараты и помогу оформить налоговый вычет.\n\n"
            "Команды:\n"
            "/summary — сводка расходов\n"
            "/help — помощь",
            reply_markup=ReplyKeyboardRemove(),
        )
    else:
        logger.warning("bot-register returned %s: %s", resp.status_code, resp.text)
        await update.message.reply_text(  # type: ignore[union-attr]
            "Ошибка регистрации. Попробуйте позже.",
            reply_markup=ReplyKeyboardRemove(),
        )

    return ConversationHandler.END


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Cancel the current conversation."""
    await update.message.reply_text(  # type: ignore[union-attr]
        "Отменено.", reply_markup=ReplyKeyboardRemove()
    )
    return ConversationHandler.END


# ── ConversationHandler factory ───────────────────────────────────────────────


def build_otp_auth_handler() -> ConversationHandler:
    """Build and return the OTP_AUTH ConversationHandler."""
    return ConversationHandler(
        entry_points=[CommandHandler("start", start)],
        states={
            WAITING_CONTACT: [
                MessageHandler(filters.CONTACT, receive_contact),
            ],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
        name="OTP_AUTH",
        persistent=False,
    )
