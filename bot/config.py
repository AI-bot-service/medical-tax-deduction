"""Bot configuration via Pydantic Settings."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class BotConfig(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    BOT_TOKEN: str = "placeholder"
    BACKEND_URL: str = "http://backend:8000"
    WEBHOOK_URL: str = ""
    WEBHOOK_SECRET: str = ""


config = BotConfig()
