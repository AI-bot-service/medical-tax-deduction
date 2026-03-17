"""Tests for GET /api/v1/health endpoint."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def mock_db_ok():
    """Patch AsyncSessionFactory so DB check succeeds."""
    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    mock_session.execute = AsyncMock(return_value=MagicMock())
    mock_factory = MagicMock(return_value=mock_session)
    return mock_factory


@pytest.fixture
def mock_redis_ok():
    """Patch get_redis so Redis check succeeds."""
    mock_redis = AsyncMock()
    mock_redis.ping = AsyncMock(return_value=True)
    return mock_redis


@pytest.mark.anyio
async def test_health_all_ok(mock_db_ok, mock_redis_ok):
    with (
        patch("app.main.AsyncSessionFactory", mock_db_ok),
        patch("app.main.get_redis", AsyncMock(return_value=mock_redis_ok)),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/v1/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["db"] == "ok"
    assert data["redis"] == "ok"


@pytest.mark.anyio
async def test_health_db_error(mock_redis_ok):
    mock_factory = MagicMock(side_effect=Exception("DB down"))

    with (
        patch("app.main.AsyncSessionFactory", mock_factory),
        patch("app.main.get_redis", AsyncMock(return_value=mock_redis_ok)),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/v1/health")

    assert response.status_code == 200
    data = response.json()
    assert data["db"] == "error"
    assert data["status"] == "degraded"


@pytest.mark.anyio
async def test_health_redis_error(mock_db_ok):
    mock_redis = AsyncMock()
    mock_redis.ping = AsyncMock(side_effect=Exception("Redis down"))

    with (
        patch("app.main.AsyncSessionFactory", mock_db_ok),
        patch("app.main.get_redis", AsyncMock(return_value=mock_redis)),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/v1/health")

    assert response.status_code == 200
    data = response.json()
    assert data["redis"] == "error"
    assert data["status"] == "degraded"
