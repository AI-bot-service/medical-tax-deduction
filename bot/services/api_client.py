"""Backend API client for MedВычет Telegram bot (C-01).

BackendClient wraps httpx.AsyncClient with:
- Cookie persistence (stores JWT access/refresh tokens as cookies)
- Automatic 401 → POST /auth/refresh → retry logic
- Simple get/post/patch methods
"""
import logging
from typing import Any

import httpx

from config import config

logger = logging.getLogger(__name__)

_REFRESH_PATH = "/api/v1/auth/refresh"


class BackendClient:
    """Async HTTP client to the backend with cookie-based JWT support."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = (base_url or config.BACKEND_URL).rstrip("/")
        self._cookies: dict[str, str] = {}

    # ------------------------------------------------------------------
    # Cookie helpers
    # ------------------------------------------------------------------

    def set_tokens(self, access_token: str, refresh_token: str) -> None:
        """Store JWT tokens in the cookie jar."""
        self._cookies["access_token"] = access_token
        self._cookies["refresh_token"] = refresh_token

    def clear_tokens(self) -> None:
        self._cookies.clear()

    @property
    def is_authenticated(self) -> bool:
        return "access_token" in self._cookies

    # ------------------------------------------------------------------
    # Internal request helpers
    # ------------------------------------------------------------------

    def _build_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self._base_url,
            cookies=self._cookies,
            timeout=30.0,
        )

    async def _refresh(self) -> bool:
        """Try to refresh access token using refresh cookie.

        Returns True if successful, False otherwise.
        """
        if "refresh_token" not in self._cookies:
            return False
        try:
            async with httpx.AsyncClient(
                base_url=self._base_url,
                cookies={"refresh_token": self._cookies["refresh_token"]},
                timeout=10.0,
            ) as client:
                resp = await client.post(_REFRESH_PATH)
                if resp.status_code == 200:
                    # Grab new cookies from response
                    for name, value in resp.cookies.items():
                        self._cookies[name] = value
                    return True
        except httpx.HTTPError as exc:
            logger.warning("Token refresh failed: %s", exc)
        return False

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        data: Any = None,
        params: dict[str, Any] | None = None,
        files: Any = None,
    ) -> httpx.Response:
        """Execute request; on 401 attempt token refresh and retry once."""
        async with self._build_client() as client:
            resp = await client.request(
                method,
                path,
                json=json,
                data=data,
                params=params,
                files=files,
            )

        if resp.status_code == 401:
            refreshed = await self._refresh()
            if refreshed:
                async with self._build_client() as client:
                    resp = await client.request(
                        method,
                        path,
                        json=json,
                        data=data,
                        params=params,
                        files=files,
                    )

        # Persist any new cookies returned by the backend
        for name, value in resp.cookies.items():
            self._cookies[name] = value

        return resp

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def get(self, path: str, *, params: dict[str, Any] | None = None) -> httpx.Response:
        return await self._request("GET", path, params=params)

    async def post(
        self,
        path: str,
        *,
        json: Any = None,
        data: Any = None,
        files: Any = None,
    ) -> httpx.Response:
        return await self._request("POST", path, json=json, data=data, files=files)

    async def patch(self, path: str, *, json: Any = None) -> httpx.Response:
        return await self._request("PATCH", path, json=json)
