"""Pydantic schemas for Auth Router (D-02)."""
import re

from pydantic import BaseModel, field_validator

_PHONE_RE = re.compile(r"^\+7\d{10}$")


class OTPRequest(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if not _PHONE_RE.match(v):
            raise ValueError("Phone must be in format +7XXXXXXXXXX (11 digits after +7)")
        return v


class VerifyRequest(BaseModel):
    phone: str
    code: str


class BotRegisterRequest(BaseModel):
    telegram_id: int
    phone: str
    username: str | None = None


class MessageResponse(BaseModel):
    message: str


class BotTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
