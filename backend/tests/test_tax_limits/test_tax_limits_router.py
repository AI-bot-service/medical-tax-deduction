"""Unit-тесты для GET /api/v1/tax-limits.

Используется минимальное FastAPI-приложение с только одним роутером,
чтобы избежать импорта тяжёлых зависимостей (redis, celery, s3 и т.д.).
"""

import fastapi
import httpx
import pytest

from app.routers.tax_limits import router


@pytest.fixture
def test_app() -> fastapi.FastAPI:
    """Минимальное FastAPI-приложение только с роутером tax_limits."""
    app = fastapi.FastAPI()
    app.include_router(router, prefix="/api/v1")
    return app


@pytest.fixture
async def client(test_app: fastapi.FastAPI) -> httpx.AsyncClient:
    """Async HTTP-клиент для тестового приложения."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=test_app), base_url="http://test"
    ) as c:
        yield c


async def test_tax_limits_2024_combined_limit(client: httpx.AsyncClient):
    """2024: combined_limit == 150000."""
    response = await client.get("/api/v1/tax-limits", params={"year": 2024})

    assert response.status_code == 200
    data = response.json()
    assert data["year"] == 2024
    assert data["combined_limit"] == 150000


async def test_tax_limits_2024_has_four_categories(client: httpx.AsyncClient):
    """2024: ровно 4 категории в limits[]."""
    response = await client.get("/api/v1/tax-limits", params={"year": 2024})

    assert response.status_code == 200
    data = response.json()
    assert len(data["limits"]) == 4


async def test_tax_limits_2023_combined_limit(client: httpx.AsyncClient):
    """2023: combined_limit == 120000."""
    response = await client.get("/api/v1/tax-limits", params={"year": 2023})

    assert response.status_code == 200
    data = response.json()
    assert data["combined_limit"] == 120000


async def test_tax_limits_treatment_expensive_is_uncapped(client: httpx.AsyncClient):
    """treatment_expensive: is_uncapped=true, limit_amount=null, refund_percent=13."""
    response = await client.get("/api/v1/tax-limits", params={"year": 2024})

    assert response.status_code == 200
    limits = response.json()["limits"]

    expensive = next(
        (item for item in limits if item["type_key"] == "treatment_expensive"), None
    )
    assert expensive is not None, "treatment_expensive not found in limits"
    assert expensive["is_uncapped"] is True
    assert expensive["limit_amount"] is None
    assert expensive["refund_percent"] == 13


async def test_tax_limits_without_year_returns_422(client: httpx.AsyncClient):
    """Запрос без year — 422 Unprocessable Entity."""
    response = await client.get("/api/v1/tax-limits")

    assert response.status_code == 422


async def test_tax_limits_2025_returns_200(client: httpx.AsyncClient):
    """2025: статус 200 и корректный JSON."""
    response = await client.get("/api/v1/tax-limits", params={"year": 2025})

    assert response.status_code == 200
    data = response.json()
    assert data["year"] == 2025
    assert data["combined_limit"] == 150000  # >=2024 → 150000
    assert len(data["limits"]) == 4


async def test_tax_limits_items_have_required_fields(client: httpx.AsyncClient):
    """Каждый элемент limits[] содержит обязательные поля."""
    response = await client.get("/api/v1/tax-limits", params={"year": 2024})

    assert response.status_code == 200
    for item in response.json()["limits"]:
        assert "type_key" in item
        assert "type_name" in item
        assert "is_uncapped" in item
        assert "is_separate" in item
