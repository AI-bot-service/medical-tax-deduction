"""
MedВычет — FastAPI Application
"""

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.v1.router import api_router
from app.db.session import engine
from app.db.base import Base


# ── Sentry ────────────────────────────────────────────────────────
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        environment=settings.APP_ENV,
    )


# ── App ───────────────────────────────────────────────────────────
app = FastAPI(
    title="MedВычет API",
    description="SaaS-платформа автоматизации налогового вычета на лекарства",
    version="2.0.0",
    docs_url="/docs" if settings.APP_DEBUG else None,
    redoc_url="/redoc" if settings.APP_DEBUG else None,
)

# ── CORS ──────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_HOSTS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Роутеры ───────────────────────────────────────────────────────
app.include_router(api_router, prefix="/api/v1")


# ── Events ────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    # В продакшне миграции через Alembic, не через create_all
    if settings.APP_ENV == "development":
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "version": "2.0.0"}
