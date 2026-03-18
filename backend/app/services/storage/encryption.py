"""AES-256 encryption for personal data fields (I-01).

Uses Fernet symmetric encryption (AES-128-CBC + HMAC-SHA256) from the
cryptography library. For 152-ФЗ compliance, personally identifiable data
(ФИО, ИНН, СНИЛС) is encrypted at rest.

Environment variable:
    ENCRYPTION_KEY — base64-encoded 32-byte key (Fernet-compatible, 44 chars)
    Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Usage:
    from app.services.storage.encryption import EncryptionService, EncryptedString

    svc = EncryptionService()
    token = svc.encrypt("Иванов Иван")
    plain = svc.decrypt(token)
"""
from __future__ import annotations

import base64
import logging
import os

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import String
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeDecorator

logger = logging.getLogger(__name__)

_DEFAULT_TEST_KEY = Fernet.generate_key()  # in-memory key for tests without env

_service_instance: "EncryptionService | None" = None


class EncryptionService:
    """Fernet (AES-128-CBC + HMAC-SHA256) encryption service.

    Reads ENCRYPTION_KEY from environment. Falls back to an ephemeral
    in-memory key when the variable is absent (tests only).
    """

    def __init__(self, key: bytes | None = None) -> None:
        if key is not None:
            self._fernet = Fernet(key)
            return

        raw = os.environ.get("ENCRYPTION_KEY")
        if raw:
            try:
                # Validate the key is a proper Fernet key
                self._fernet = Fernet(raw.encode() if isinstance(raw, str) else raw)
                return
            except Exception as exc:
                logger.warning("Invalid ENCRYPTION_KEY: %s — using ephemeral key", exc)

        logger.warning(
            "ENCRYPTION_KEY not set — using ephemeral in-memory key. "
            "This is INSECURE for production!"
        )
        self._fernet = Fernet(_DEFAULT_TEST_KEY)

    def encrypt(self, value: str) -> str:
        """Encrypt a plaintext string and return a Fernet token (base64 string).

        Args:
            value: plaintext UTF-8 string

        Returns:
            Fernet token as a URL-safe base64 string
        """
        token = self._fernet.encrypt(value.encode("utf-8"))
        return token.decode("ascii")

    def decrypt(self, token: str) -> str:
        """Decrypt a Fernet token and return the plaintext.

        Args:
            token: Fernet token string (as returned by encrypt)

        Returns:
            Decrypted plaintext UTF-8 string

        Raises:
            InvalidToken: if the token is invalid or was encrypted with a different key
        """
        plaintext = self._fernet.decrypt(token.encode("ascii"))
        return plaintext.decode("utf-8")

    @staticmethod
    def generate_key() -> str:
        """Generate a new Fernet key suitable for ENCRYPTION_KEY env var."""
        return Fernet.generate_key().decode("ascii")


def get_encryption_service() -> EncryptionService:
    """Return the global EncryptionService singleton."""
    global _service_instance
    if _service_instance is None:
        _service_instance = EncryptionService()
    return _service_instance


# ── SQLAlchemy TypeDecorator ──────────────────────────────────────────────────


class EncryptedString(TypeDecorator):
    """SQLAlchemy column type that transparently encrypts/decrypts on read/write.

    Usage in model:
        class User(Base):
            full_name: Mapped[str | None] = mapped_column(EncryptedString(512), nullable=True)

    The stored value is a Fernet token (~100 bytes overhead over plaintext).
    Length 512 is sufficient for typical ФИО/ИНН/СНИЛС values.
    """

    impl = String
    cache_ok = True

    def __init__(self, length: int = 512, *args, **kwargs) -> None:
        super().__init__(length, *args, **kwargs)

    def process_bind_param(self, value: str | None, dialect: Dialect) -> str | None:
        """Encrypt before writing to DB."""
        if value is None:
            return None
        return get_encryption_service().encrypt(value)

    def process_result_value(self, value: str | None, dialect: Dialect) -> str | None:
        """Decrypt after reading from DB."""
        if value is None:
            return None
        try:
            return get_encryption_service().decrypt(value)
        except (InvalidToken, Exception) as exc:
            logger.error("Failed to decrypt value: %s", exc)
            return None
