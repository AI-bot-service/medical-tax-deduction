"""OpenAI Vision extractor — replaces all OCR engines (EasyOCR, Tesseract, PaddleOCR).

Sends the receipt/prescription image directly to GPT-4o vision and returns
structured JSON with all extracted fields.
"""
from __future__ import annotations

import base64
import json
import logging
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI

from app.config import settings

logger = logging.getLogger(__name__)

# prompts/ живёт в корне backend/, три уровня вверх от этого файла
_SYSTEM_PROMPT_PATH = Path(__file__).parent.parent.parent.parent / "prompts" / "receipt_ocr_system.md"

# Lazy singleton — created once per worker process
_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


def _load_system_prompt() -> str:
    """Read system prompt from file (cached by Python module import)."""
    return _SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")


async def extract(image_bytes: bytes) -> dict[str, Any]:
    """Send image to OpenAI Vision API and return extracted data as dict.

    Args:
        image_bytes: Raw JPEG or PNG image bytes.

    Returns:
        Parsed JSON dict with receipt or prescription fields.
        Returns empty dict on any error.
    """
    try:
        b64_image = base64.b64encode(image_bytes).decode("ascii")
        system_prompt = _load_system_prompt()
        client = _get_client()

        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{b64_image}",
                                "detail": "high",
                            },
                        },
                        {
                            "type": "text",
                            "text": "Extract all data from this pharmacy document.",
                        },
                    ],
                },
            ],
            response_format={"type": "json_object"},
            max_tokens=2000,
            temperature=0,
        )

        content = response.choices[0].message.content or "{}"
        result = json.loads(content)
        logger.info(
            "openai_vision: extracted document_type=%s fields=%s",
            result.get("document_type", "unknown"),
            list(result.keys()),
        )
        return result

    except Exception as exc:
        logger.error("openai_vision: extraction failed: %s", exc)
        return {}
