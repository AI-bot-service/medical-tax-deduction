"""MedВычет Telegram bot entry point."""
import logging

from telegram.ext import Application

from config import config

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


def main() -> None:
    app = Application.builder().token(config.BOT_TOKEN).build()
    logger.info("Starting bot in polling mode")
    app.run_polling()


if __name__ == "__main__":
    main()
