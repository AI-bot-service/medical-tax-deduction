"""OTP Service: генерация и верификация одноразовых кодов (D-01)."""
import secrets
from datetime import UTC, datetime, timedelta

import bcrypt
from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.otp_code import OTPCode

OTP_TTL_MINUTES = 5
# Блокировка при attempts >= 5: первые 5 попыток возвращают False, 6-я вызывает HTTP 429
MAX_ATTEMPTS = 5


class OTPService:
    async def generate_otp(self, phone_hash: str, session: AsyncSession) -> str:
        """Генерирует 6-значный OTP, инвалидирует предыдущий для этого phone_hash."""
        await session.execute(
            update(OTPCode)
            .where(OTPCode.phone_hash == phone_hash, OTPCode.used.is_(False))
            .values(used=True)
        )

        code = f"{secrets.randbelow(10**6):06d}"
        code_hash = bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode()

        otp = OTPCode(
            phone_hash=phone_hash,
            code_hash=code_hash,
            expires_at=datetime.now(UTC) + timedelta(minutes=OTP_TTL_MINUTES),
        )
        session.add(otp)
        await session.commit()
        await session.refresh(otp)
        return code

    async def verify_otp(
        self, phone_hash: str, code: str, session: AsyncSession
    ) -> bool:
        """Верифицирует OTP. Raises HTTPException(429) при превышении попыток."""
        now = datetime.now(UTC)
        result = await session.execute(
            select(OTPCode)
            .where(
                OTPCode.phone_hash == phone_hash,
                OTPCode.used.is_(False),
                OTPCode.expires_at > now,
            )
            .order_by(OTPCode.created_at.desc())
            .limit(1)
        )
        otp = result.scalar_one_or_none()

        if otp is None:
            return False

        # Защита от повторных вызовов после блокировки
        if otp.attempts >= MAX_ATTEMPTS:
            raise HTTPException(status_code=429, detail="Слишком много попыток")

        if bcrypt.checkpw(code.encode(), otp.code_hash.encode()):
            otp.used = True
            await session.commit()
            return True

        # Спецификация: первые MAX_ATTEMPTS неверных попыток → False.
        # Только при следующем вызове (attempts уже >= MAX_ATTEMPTS) → 429.
        otp.attempts += 1
        await session.commit()
        return False
