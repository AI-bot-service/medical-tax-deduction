"""Mini App Auth Service (D-05).

Verifies Telegram WebApp initData using HMAC-SHA256.

Reference:
  https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
"""
from __future__ import annotations

import hashlib
import hmac
import time
from urllib.parse import parse_qsl, unquote


class MiniAppVerificationError(Exception):
    """Raised when initData verification fails."""


class MiniAppService:
    """Verifies Telegram WebApp initData and extracts user information."""

    MAX_AUTH_AGE_SECONDS: int = 86400  # 24 hours

    def __init__(self, bot_token: str) -> None:
        self._bot_token = bot_token
        # Secret key = HMAC-SHA256("WebAppData", bot_token)
        self._secret_key = hmac.new(
            b"WebAppData",
            bot_token.encode(),
            hashlib.sha256,
        ).digest()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def verify(self, init_data: str) -> dict:
        """Verify initData and return parsed fields.

        Args:
            init_data: URL-encoded string from window.Telegram.WebApp.initData

        Returns:
            dict with parsed fields (e.g. {"id": 123, "first_name": "John", ...})

        Raises:
            MiniAppVerificationError: if signature is invalid or data is too old
        """
        fields = dict(parse_qsl(init_data, keep_blank_values=True))

        received_hash = fields.pop("hash", None)
        if received_hash is None:
            raise MiniAppVerificationError("Отсутствует поле hash")

        # Build data-check-string: sorted key=value pairs separated by \n
        data_check_string = "\n".join(
            f"{k}={v}" for k, v in sorted(fields.items())
        )

        # Compute expected hash
        expected_hash = hmac.new(
            self._secret_key,
            data_check_string.encode(),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected_hash, received_hash):
            raise MiniAppVerificationError("Неверная подпись initData")

        # Check auth_date is not too old
        auth_date_str = fields.get("auth_date")
        if auth_date_str is not None:
            try:
                auth_date = int(auth_date_str)
                if time.time() - auth_date > self.MAX_AUTH_AGE_SECONDS:
                    raise MiniAppVerificationError("initData устарел")
            except ValueError:
                raise MiniAppVerificationError("Неверный формат auth_date")

        return fields

    def extract_user_id(self, fields: dict) -> int:
        """Extract telegram_id from verified fields.

        The 'user' field contains a JSON-encoded object with 'id'.
        For convenience, if there's a top-level 'id' field, use it.
        """
        import json

        user_json = fields.get("user")
        if user_json:
            try:
                user_data = json.loads(unquote(user_json))
                return int(user_data["id"])
            except (json.JSONDecodeError, KeyError, ValueError) as exc:
                raise MiniAppVerificationError(f"Неверный формат поля user: {exc}")

        # Fallback: top-level id (some older versions)
        raw_id = fields.get("id")
        if raw_id:
            return int(raw_id)

        raise MiniAppVerificationError("Не найден telegram_id в initData")
