"""Bot utility commands: /summary, /export, /help (C-05).

Formatting: MarkdownV2 with proper escaping.
Mini App inline button: opens t.me/{botname}/app.
"""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime
from typing import Any

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import CommandHandler, ContextTypes

from services.api_client import BackendClient

logger = logging.getLogger(__name__)

_CLIENT_KEY = "api_client"

# Characters that must be escaped in MarkdownV2
_SPECIAL_CHARS = r"\_*[]()~`>#+-=|{}.!"
_ESCAPE_RE = re.compile(r"([" + re.escape(_SPECIAL_CHARS) + r"])")


def _esc(text: str) -> str:
    """Escape special MarkdownV2 characters."""
    return _ESCAPE_RE.sub(r"\\\1", str(text))


def _get_client(context: ContextTypes.DEFAULT_TYPE) -> BackendClient:
    if _CLIENT_KEY not in context.user_data:  # type: ignore[operator]
        context.user_data[_CLIENT_KEY] = BackendClient()  # type: ignore[index]
    return context.user_data[_CLIENT_KEY]  # type: ignore[index]


def _mini_app_keyboard(bot_username: str | None) -> InlineKeyboardMarkup | None:
    """Build inline keyboard with Mini App button if bot username is available."""
    if not bot_username:
        return None
    return InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton(
                    "📱 Открыть МедВычет",
                    url=f"https://t.me/{bot_username}/app",
                )
            ]
        ]
    )


# ---------------------------------------------------------------------------
# /help
# ---------------------------------------------------------------------------


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Show list of available commands."""
    msg = (
        "🤖 *МедВычет — команды*\n\n"
        "/start — регистрация и вход\n"
        "/summary — сводка расходов за текущий год\n"
        "/export — сформировать ZIP\\-пакет для ИФНС\n"
        "/help — эта справка\n\n"
        "📸 Отправьте фото чека — я распознаю его автоматически\\."
    )
    bot_username = context.bot.username if context.bot else None
    await update.message.reply_text(  # type: ignore[union-attr]
        msg,
        parse_mode="MarkdownV2",
        reply_markup=_mini_app_keyboard(bot_username),
    )


# ---------------------------------------------------------------------------
# /summary
# ---------------------------------------------------------------------------


async def cmd_summary(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send monthly expense summary."""
    client = _get_client(context)
    if not client.is_authenticated:
        await update.message.reply_text(  # type: ignore[union-attr]
            "Сначала авторизуйтесь командой /start"
        )
        return

    year = datetime.now().year
    try:
        data: dict[str, Any] = await client.get(f"/api/v1/receipts/summary?year={year}")
    except Exception as exc:
        logger.warning("summary API error: %s", exc)
        await update.message.reply_text(  # type: ignore[union-attr]
            "Не удалось получить данные. Попробуйте позже."
        )
        return

    months: list[dict[str, Any]] = data.get("months", [])
    total_amount = float(data.get("total_amount", 0))
    deduction_amount = float(data.get("deduction_amount", 0))
    limit_pct = float(data.get("limit_used_pct", 0))

    lines: list[str] = []

    for m in months:
        month_str = m.get("month", "")  # "YYYY-MM"
        if len(month_str) == 7:
            mo, yr = month_str[5:], month_str[:4]
            month_label = f"{mo}/{yr}"
        else:
            month_label = month_str
        amount = float(m.get("total_amount", 0))
        count = int(m.get("receipts_count", 0))
        missing = m.get("has_missing_prescriptions", False)
        miss_icon = " ⚠️" if missing else ""
        lines.append(
            f"{_esc(month_label)}: {_esc(f'{amount:,.0f}')} ₽ "
            f"\\({_esc(str(count))} чека?\\){_esc(miss_icon)}"
        )

    ndfl_return = round(float(data.get("deduction_amount", 0)) * 0.13)

    body = "\n".join(lines) if lines else "_нет данных_"

    msg = (
        f"📊 *{_esc(str(year))} год*\n\n"
        f"{body}\n\n"
        f"Итого: *{_esc(f'{total_amount:,.0f}')} ₽*\n"
        f"Сумма к вычету: {_esc(f'{deduction_amount:,.0f}')} ₽\n"
        f"Возврат НДФЛ 13%: *{_esc(f'{ndfl_return:,}')} ₽*\n"
        f"Использовано: {_esc(f'{limit_pct:.1f}')}% от 150 000 ₽"
    )

    bot_username = context.bot.username if context.bot else None
    await update.message.reply_text(  # type: ignore[union-attr]
        msg,
        parse_mode="MarkdownV2",
        reply_markup=_mini_app_keyboard(bot_username),
    )


# ---------------------------------------------------------------------------
# /export
# ---------------------------------------------------------------------------

_POLL_INTERVAL = 3  # seconds
_POLL_MAX = 20  # max attempts (60 sec total)


async def cmd_export(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Trigger ZIP export and send download link when ready."""
    client = _get_client(context)
    if not client.is_authenticated:
        await update.message.reply_text(  # type: ignore[union-attr]
            "Сначала авторизуйтесь командой /start"
        )
        return

    year = datetime.now().year
    sent = await update.message.reply_text(  # type: ignore[union-attr]
        f"⏳ Готовлю документы за {year} год\\.\\.\\.",
        parse_mode="MarkdownV2",
    )

    try:
        job: dict[str, Any] = await client.post(
            f"/api/v1/export?year={year}", data={}
        )
    except Exception as exc:
        logger.warning("export create API error: %s", exc)
        await sent.edit_text("Ошибка при создании экспорта. Попробуйте позже.")
        return

    export_id = job.get("export_id")
    if not export_id:
        await sent.edit_text("Ошибка: не получен ID задачи экспорта.")
        return

    # Poll for completion
    for _ in range(_POLL_MAX):
        await asyncio.sleep(_POLL_INTERVAL)
        try:
            status: dict[str, Any] = await client.get(f"/api/v1/export/{export_id}")
        except Exception:
            continue

        job_status = status.get("status", "")
        if job_status == "done":
            url = status.get("download_url")
            if url:
                bot_username = context.bot.username if context.bot else None
                kb = InlineKeyboardMarkup(
                    [
                        [InlineKeyboardButton("⬇️ Скачать ZIP", url=url)],
                        *(
                            [[InlineKeyboardButton("📱 Открыть МедВычет",
                                url=f"https://t.me/{bot_username}/app")]]
                            if bot_username
                            else []
                        ),
                    ]
                )
                await sent.edit_text(
                    f"✅ Архив за *{_esc(str(year))}* год готов\\!",
                    parse_mode="MarkdownV2",
                    reply_markup=kb,
                )
            else:
                await sent.edit_text("Архив готов, но ссылка недоступна.")
            return

        if job_status == "failed":
            await sent.edit_text("❌ Ошибка при формировании архива.")
            return

    await sent.edit_text(
        "⏳ Формирование архива занимает больше обычного\\. "
        "Попробуйте команду позже\\.",
        parse_mode="MarkdownV2",
    )


# ---------------------------------------------------------------------------
# Handler builders
# ---------------------------------------------------------------------------


def build_command_handlers() -> list[CommandHandler]:  # type: ignore[type-arg]
    """Return list of CommandHandler instances for /help, /summary, /export."""
    return [
        CommandHandler("help", cmd_help),
        CommandHandler("summary", cmd_summary),
        CommandHandler("export", cmd_export),
    ]
