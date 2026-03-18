"""Error handler for MedВычет Telegram bot (C-01).

Catches all unhandled exceptions in PTB handlers, reports to Sentry,
and sends a friendly Russian message to the user.
"""
import logging

from telegram import Update
from telegram.ext import ContextTypes

logger = logging.getLogger(__name__)


async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle all uncaught exceptions in PTB handlers."""
    logger.error("Unhandled exception", exc_info=context.error)

    # Report to Sentry if available
    try:
        import sentry_sdk

        sentry_sdk.capture_exception(context.error)
    except Exception:
        pass

    # Notify the user if we have a chat to reply to
    if isinstance(update, Update) and update.effective_message is not None:
        try:
            await update.effective_message.reply_text("Что-то пошло не так. Попробуйте позже.")
        except Exception:
            logger.warning("Failed to send error message to user")
