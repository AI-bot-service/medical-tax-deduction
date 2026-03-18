"""MedВычет Telegram bot entry point (C-01)."""
import logging

from telegram.ext import Application

from config import config
from handlers.commands import build_command_handlers
from handlers.conversations import build_otp_auth_handler
from handlers.errors import error_handler
from handlers.receipt_flow import build_receipt_flow_handlers

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


def create_app() -> Application:
    """Build and configure the PTB Application."""
    builder = Application.builder().token(config.BOT_TOKEN)
    app = builder.build()

    # Register conversation handlers
    app.add_handler(build_otp_auth_handler())

    # Register receipt upload flow handlers
    for handler in build_receipt_flow_handlers():
        app.add_handler(handler)

    # Register utility commands: /help, /summary, /export
    for handler in build_command_handlers():
        app.add_handler(handler)

    # Register global error handler
    app.add_error_handler(error_handler)

    return app


def main() -> None:
    app = create_app()

    if config.WEBHOOK_URL:
        logger.info("Starting bot in webhook mode: %s", config.WEBHOOK_URL)
        app.run_webhook(
            listen="0.0.0.0",
            port=8443,
            url_path=config.BOT_TOKEN,
            webhook_url=f"{config.WEBHOOK_URL}/{config.BOT_TOKEN}",
            secret_token=config.WEBHOOK_SECRET or None,
        )
    else:
        logger.info("Starting bot in polling mode")
        app.run_polling()


if __name__ == "__main__":
    main()
