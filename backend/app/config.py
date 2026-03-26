from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql+asyncpg://medvychet:password@localhost:5432/medvychet"
    database_url_worker: str = (
        "postgresql+asyncpg://medvychet_worker:password@localhost:5432/medvychet"
    )

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Yandex Object Storage
    yos_access_key: str = ""
    yos_secret_key: str = ""
    yos_endpoint: str = "https://storage.yandexcloud.net"
    yos_region: str = "ru-central1"
    yos_bucket_receipts: str = "medvychet-receipts"
    yos_bucket_prescriptions: str = "medvychet-prescriptions"
    yos_bucket_exports: str = "medvychet-exports"

    # Telegram
    telegram_bot_token: str = ""
    telegram_webhook_secret: str = ""

    # JWT
    jwt_secret_key: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 30

    # Encryption
    encryption_key: str = ""

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # Sentry
    sentry_dsn: str = ""

    # App
    environment: str = "development"
    debug: bool = True
    frontend_url: str = "http://localhost:3000"
    backend_url: str = "http://localhost:8000"


settings = Settings()
