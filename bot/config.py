"""Bot configuration via Pydantic Settings."""
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class BotConfig(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    BOT_TOKEN: str = Field("placeholder", alias="TELEGRAM_BOT_TOKEN")
    BACKEND_URL: str = "http://backend:8000"
    WEBHOOK_URL: str = ""
    WEBHOOK_SECRET: str = Field("", alias="TELEGRAM_WEBHOOK_SECRET")


config = BotConfig()
