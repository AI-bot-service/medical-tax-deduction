"""TDD tests for BackendClient (C-01).

Uses a custom AsyncTransport to intercept httpx requests without real network.
"""
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
import pytest

# Ensure bot/ directory is on sys.path so `from services.api_client import ...` works
_BOT_DIR = Path(__file__).parents[3]  # bot/tests/test_bot/ → bot/
if str(_BOT_DIR) not in sys.path:
    sys.path.insert(0, str(_BOT_DIR))

from services.api_client import BackendClient  # noqa: E402

# ---------------------------------------------------------------------------
# Fake async transport
# ---------------------------------------------------------------------------


class _QueueTransport(httpx.AsyncBaseTransport):
    """Returns pre-configured responses in FIFO order."""

    def __init__(self, responses: list[httpx.Response]) -> None:
        self._queue = list(responses)

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        if not self._queue:
            raise RuntimeError("No more responses in queue")
        return self._queue.pop(0)


def _resp(status: int, body: dict | None = None, set_cookies: dict | None = None) -> httpx.Response:
    """Build a real httpx.Response (supports cookies)."""
    headers: list[tuple[str, str]] = []
    if set_cookies:
        for k, v in set_cookies.items():
            headers.append(("set-cookie", f"{k}={v}"))
    return httpx.Response(status, json=body or {}, headers=headers)


def _client_with_transport(*responses: httpx.Response) -> BackendClient:
    """BackendClient whose underlying httpx.AsyncClient uses a fake transport."""
    transport = _QueueTransport(list(responses))
    client = BackendClient(base_url="http://test-backend")
    # Patch _build_client to inject our transport
    client._transport = transport  # store for use
    original_build = client._build_client

    def _patched_build():
        return httpx.AsyncClient(
            base_url="http://test-backend",
            cookies=client._cookies,
            transport=transport,
        )

    client._build_client = _patched_build  # type: ignore[method-assign]
    return client


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def client():
    return BackendClient(base_url="http://test-backend")


# ---------------------------------------------------------------------------
# Basic HTTP methods
# ---------------------------------------------------------------------------


async def test_get_returns_200():
    c = _client_with_transport(_resp(200, {"status": "ok"}))
    resp = await c.get("/api/v1/health")
    assert resp.status_code == 200


async def test_post_returns_200():
    c = _client_with_transport(_resp(200, {"message": "Код отправлен"}))
    resp = await c.post("/api/v1/auth/otp", json={"phone": "+79001234567"})
    assert resp.status_code == 200


async def test_patch_returns_200():
    c = _client_with_transport(_resp(200, {"id": "abc"}))
    resp = await c.patch("/api/v1/receipts/abc", json={"pharmacy_name": "Аптека"})
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Cookie / token management
# ---------------------------------------------------------------------------


async def test_set_tokens_stores_cookies(client):
    client.set_tokens("acc123", "ref456")
    assert client._cookies["access_token"] == "acc123"
    assert client._cookies["refresh_token"] == "ref456"


async def test_is_authenticated_false_initially(client):
    assert client.is_authenticated is False


async def test_is_authenticated_true_after_set_tokens(client):
    client.set_tokens("acc", "ref")
    assert client.is_authenticated is True


async def test_clear_tokens_removes_cookies(client):
    client.set_tokens("acc", "ref")
    client.clear_tokens()
    assert not client.is_authenticated


# ---------------------------------------------------------------------------
# 401 → refresh → retry
# ---------------------------------------------------------------------------


async def test_401_triggers_refresh_and_retry():
    """On 401, client calls _refresh then retries → gets 200."""
    # First request returns 401; after refresh, second request returns 200
    c = _client_with_transport(
        _resp(401),  # original request
        _resp(200, {"data": "ok"}),  # retry after refresh
    )

    # Simulate successful refresh (swap access token)
    async def fake_refresh(self=c):
        c._cookies["access_token"] = "new_acc"
        c._cookies["refresh_token"] = "new_ref"
        return True

    # Patch _refresh method on the instance
    c._refresh = fake_refresh  # type: ignore[method-assign]

    c.set_tokens("old_acc", "old_ref")
    resp = await c._request("GET", "/api/v1/receipts")
    assert resp.status_code == 200


async def test_401_without_refresh_token_returns_401():
    """No refresh token → 401 returned as-is without retry."""
    c = _client_with_transport(_resp(401))
    # No tokens set → no refresh attempt
    resp = await c._request("GET", "/api/v1/receipts")
    assert resp.status_code == 401


async def test_refresh_failure_returns_401():
    """If refresh itself fails, original 401 propagates."""
    c = _client_with_transport(
        _resp(401),  # original request
        _resp(401),  # retry (refresh returned False, but we still retry once)
    )
    c.set_tokens("acc", "ref")

    async def fake_refresh_fail():
        return False

    c._refresh = fake_refresh_fail  # type: ignore[method-assign]

    resp = await c._request("GET", "/api/v1/receipts")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Response cookie persistence
# ---------------------------------------------------------------------------


async def test_cookies_from_response_are_stored():
    """Set-Cookie from backend response is persisted in client._cookies."""
    c = _client_with_transport(
        _resp(200, {}, set_cookies={"access_token": "fresh_acc", "refresh_token": "fresh_ref"})
    )
    await c._request("POST", "/api/v1/auth/verify")
    assert c._cookies.get("access_token") == "fresh_acc"
    assert c._cookies.get("refresh_token") == "fresh_ref"


# ---------------------------------------------------------------------------
# GET passes query params
# ---------------------------------------------------------------------------


async def test_get_with_params_sends_query_string():
    """BackendClient.get forwards params to the underlying request."""
    received_params: dict = {}

    class _InspectTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
            received_params.update(dict(request.url.params))
            return httpx.Response(200, json={})

    c = BackendClient(base_url="http://test-backend")
    c._build_client = lambda: httpx.AsyncClient(  # type: ignore[method-assign]
        base_url="http://test-backend",
        transport=_InspectTransport(),
    )
    await c.get("/api/v1/receipts", params={"year": "2024", "month": "01"})
    assert received_params.get("year") == "2024"
    assert received_params.get("month") == "01"
