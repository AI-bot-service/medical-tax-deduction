from contextlib import asynccontextmanager
from typing import Any

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

import app.dependencies as _deps
from app.config import settings
from app.dependencies import AsyncSessionFactory, get_redis


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────────
    if settings.sentry_dsn:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment,
            traces_sample_rate=0.1,
        )

    yield

    # ── Shutdown ─────────────────────────────────────────────────────────────
    await _deps.engine.dispose()
    if _deps._redis_pool is not None:
        await _deps._redis_pool.aclose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="MedВычет API",
        description="Автоматизация налогового вычета на лекарства (ст. 219 НК РФ)",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # ── CORS ─────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_url],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── RLS Middleware ────────────────────────────────────────────────────────
    from app.middleware.rls import RLSMiddleware

    app.add_middleware(RLSMiddleware)

    # ── Routers ──────────────────────────────────────────────────────────────
    from app.routers.auth import router as auth_router
    from app.routers.batch import router as batch_router
    from app.routers.export import router as export_router
    from app.routers.prescriptions import router as prescriptions_router
    from app.routers.receipts import router as receipts_router

    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(receipts_router, prefix="/api/v1")
    app.include_router(prescriptions_router, prefix="/api/v1")
    app.include_router(batch_router, prefix="/api/v1")
    app.include_router(export_router, prefix="/api/v1")

    return app


app = create_app()


# ── Health endpoint ───────────────────────────────────────────────────────────


@app.get("/api/v1/health", tags=["health"])
async def health() -> dict[str, Any]:
    """Return service health status including DB and Redis connectivity."""
    result: dict[str, Any] = {"status": "ok", "db": "ok", "redis": "ok"}

    # Check DB
    try:
        async with AsyncSessionFactory() as session:
            await session.execute(text("SELECT 1"))
    except Exception:
        result["db"] = "error"
        result["status"] = "degraded"

    # Check Redis
    try:
        redis = await get_redis()
        await redis.ping()
    except Exception:
        result["redis"] = "error"
        result["status"] = "degraded"

    return result
