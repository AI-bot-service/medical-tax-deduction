"""
Главный пайплайн OCR — параллельное выполнение QR + OCR с merge
================================================================
Архитектура (v2):

  Фото чека
      ├─── [asyncio] QR → ФНС API  ──────────────────────────┐
      │         confidence ~1.00 (свежий чек)                 │
      │         confidence ~0.50 (ФНС недоступна)             ├──► ResultMerger
      │         None (QR не найден / чек старый)              │
      └─── [executor] EasyOCR → Tesseract fallback ───────────┘
                confidence ~0.75–0.92

  ResultMerger:
      - Оба сработали + данные совпадают  → confidence 1.0, DONE
      - Только ФНС                        → confidence ФНС, статус по порогу
      - Только OCR                        → confidence OCR, статус по порогу
      - Оба сработали + расхождение       → берём ФНС, needs_review=True
      - Никто не сработал                 → FAILED

  Логика давности чека:
      - ФНС API надёжен для чеков < ~12 месяцев
      - Для старых чеков QR пропускается, только OCR
      - Пользователь может запросить дубликат у аптеки (54-ФЗ, 5 лет)

  [Шаг 3 — Google Vision API добавим позже как приоритет для Pro-тарифа]
"""

import asyncio
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Optional

from step1_qr_scanner import QRReceiptScanner, ParsedReceipt, ReceiptItem
from step2_ocr_scanner import OCRReceiptScanner

logger = logging.getLogger(__name__)

# Один глобальный executor для CPU-bound OCR задач
_ocr_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="ocr_worker")


# ─── Статусы ─────────────────────────────────────────────────────

class OCRStatus(str, Enum):
    DONE   = "done"    # confidence >= 0.85, принято автоматически
    REVIEW = "review"  # confidence 0.60–0.84, нужна проверка пользователя
    FAILED = "failed"  # confidence < 0.60 или критическая ошибка


# ─── Результат с диагностикой ────────────────────────────────────

@dataclass
class PipelineResult:
    """Расширенный результат пайплайна — включает диагностику источников."""
    receipt: ParsedReceipt
    status: OCRStatus

    # Что реально сработало
    fns_result:  Optional[ParsedReceipt] = None
    ocr_result:  Optional[ParsedReceipt] = None

    # Метаданные merge
    merge_strategy: str = ""       # "fns_only" | "ocr_only" | "merged" | "conflict"
    amount_match:   bool = False   # суммы совпали между ФНС и OCR
    date_match:     bool = False   # даты совпали между ФНС и OCR

    # Подсказки пользователю при REVIEW/FAILED
    user_hint: str = ""


# ─── Определитель давности чека ──────────────────────────────────

class ReceiptAgeEstimator:
    """
    Оценивает возраст чека по QR-данным.
    Используется чтобы не делать запрос в ФНС для заведомо старых чеков.
    """

    # ФНС Open API надёжно возвращает чеки не старше этого срока
    FNS_RELIABLE_DAYS = 365  # ~12 месяцев

    def parse_qr_date(self, qr_raw: str) -> Optional[datetime]:
        """Парсит дату из QR-строки чека (t=20240315T1200)."""
        m = re.search(r"t=(\d{8}T\d{4})", qr_raw, re.IGNORECASE)
        if not m:
            return None
        try:
            return datetime.strptime(m.group(1), "%Y%m%dT%H%M")
        except ValueError:
            return None

    def is_fns_reliable(self, qr_raw: Optional[str]) -> bool:
        """
        True  → стоит запрашивать ФНС API.
        False → чек скорее всего слишком старый, ФНС может не вернуть.
        None-qr (нет QR) → True: попробуем, хуже не будет.
        """
        if not qr_raw:
            return True  # QR не декодирован — пробуем ФНС в любом случае

        date = self.parse_qr_date(qr_raw)
        if not date:
            return True  # дату не разобрали — пробуем

        age_days = (datetime.now() - date).days
        is_reliable = age_days <= self.FNS_RELIABLE_DAYS

        if not is_reliable:
            logger.info(
                f"Чек от {date.strftime('%d.%m.%Y')} ({age_days} дней) — "
                f"старше {self.FNS_RELIABLE_DAYS} дней, ФНС API пропускаем"
            )
        return is_reliable


# ─── Слияние результатов ─────────────────────────────────────────

class ResultMerger:
    """
    Объединяет результаты ФНС и OCR в один финальный ParsedReceipt.

    Правила приоритета:
      1. ФНС данные → всегда берём если confidence >= 0.9
      2. ФНС + OCR совпали по сумме и дате → confidence 1.0
      3. ФНС + OCR расходятся → берём ФНС, но needs_review=True
      4. Только OCR → берём OCR как есть
      5. Только ФНС частичный → берём ФНС, needs_review=True
    """

    # Максимальное расхождение сумм считается «совпадением» (погрешность OCR)
    AMOUNT_TOLERANCE     = 0.02   # 2%
    AMOUNT_TOLERANCE_ABS = 5.0   # или до 5 рублей

    def merge(
        self,
        fns: Optional[ParsedReceipt],
        ocr: Optional[ParsedReceipt],
    ) -> tuple[ParsedReceipt, str]:
        """Возвращает (итоговый ParsedReceipt, стратегия merge)."""

        # ── Оба упали ─────────────────────────────────────────────
        if not fns and not ocr:
            return self._empty_failed(), "both_failed"

        # ── Только OCR ────────────────────────────────────────────
        if not fns:
            logger.info("Merge: только OCR")
            return ocr, "ocr_only"

        # ── Только ФНС ────────────────────────────────────────────
        if not ocr:
            logger.info(f"Merge: только ФНС (confidence={fns.confidence:.2f})")
            return fns, "fns_only"

        # ── Оба есть — сравниваем ────────────────────────────────
        amount_match = self._amounts_match(fns.total_amount, ocr.total_amount)
        date_match   = self._dates_match(fns.purchase_date, ocr.purchase_date)

        logger.info(
            f"Merge: ФНС conf={fns.confidence:.2f}, OCR conf={ocr.confidence:.2f} | "
            f"сумма={'✓' if amount_match else '✗'} "
            f"дата={'✓' if date_match else '✗'}"
        )

        if amount_match and date_match:
            merged = self._build_merged(fns, ocr, confidence=1.0, needs_review=False)
            return merged, "merged"

        if amount_match and not date_match:
            # Суммы совпали, дата расходится — берём ФНС дату (она точнее)
            merged = self._build_merged(fns, ocr, confidence=0.92, needs_review=False)
            return merged, "merged_date_conflict"

        # Суммы расходятся — доверяем ФНС, но просим подтвердить
        logger.warning(
            f"Конфликт сумм: ФНС={fns.total_amount:.2f}, OCR={ocr.total_amount:.2f}"
        )
        fns.needs_review = True
        fns.confidence   = min(fns.confidence, 0.75)
        return fns, "conflict"

    def _build_merged(
        self,
        fns: ParsedReceipt,
        ocr: ParsedReceipt,
        confidence: float,
        needs_review: bool,
    ) -> ParsedReceipt:
        """
        Итоговый чек:
          - Структура (позиции, ИНН) — из ФНС
          - Дополняем из OCR если поле ФНС пустое
        """
        return ParsedReceipt(
            source        = f"merged:{fns.source}+{ocr.source}",
            purchase_date = fns.purchase_date or ocr.purchase_date,
            pharmacy_name = fns.pharmacy_name or ocr.pharmacy_name,
            pharmacy_inn  = fns.pharmacy_inn  or ocr.pharmacy_inn,
            total_amount  = fns.total_amount,
            items         = fns.items if fns.items else ocr.items,
            confidence    = confidence,
            raw_qr        = fns.raw_qr,
            needs_review  = needs_review,
        )

    def _amounts_match(self, a: Optional[float], b: Optional[float]) -> bool:
        if not a or not b:
            return False
        abs_diff = abs(a - b)
        rel_diff = abs_diff / max(a, b)
        return abs_diff <= self.AMOUNT_TOLERANCE_ABS or rel_diff <= self.AMOUNT_TOLERANCE

    def _dates_match(
        self,
        a: Optional[datetime],
        b: Optional[datetime],
    ) -> bool:
        if not a or not b:
            return False
        return abs((a.date() - b.date()).days) <= 1

    @staticmethod
    def _empty_failed() -> ParsedReceipt:
        return ParsedReceipt(
            source="failed", purchase_date=None, pharmacy_name=None,
            pharmacy_inn=None, total_amount=0.0, confidence=0.0,
            needs_review=True,
            error="Не удалось распознать чек ни одним методом",
        )


# ─── Генератор подсказок пользователю ────────────────────────────

class UserHintGenerator:

    def generate(self, result: "PipelineResult") -> str:
        status   = result.status
        strategy = result.merge_strategy
        receipt  = result.receipt

        if status == OCRStatus.DONE:
            src = self._source_label(receipt.source)
            return (
                f"✅ Чек распознан автоматически ({src}). "
                f"Найдено позиций: {len(receipt.items)}."
            )

        if status == OCRStatus.REVIEW:
            if strategy == "conflict":
                fa = result.fns_result.total_amount if result.fns_result else 0
                oa = result.ocr_result.total_amount if result.ocr_result else 0
                return (
                    f"⚠️ Расхождение сумм: ФНС={fa:.2f} руб., OCR={oa:.2f} руб. "
                    f"Пожалуйста, проверьте данные."
                )
            if not result.fns_result:
                return (
                    f"⚠️ QR не найден, чек распознан через OCR "
                    f"(уверенность {receipt.confidence:.0%}). Проверьте позиции."
                )
            return "⚠️ Чек распознан частично. Пожалуйста, проверьте данные."

        # FAILED
        return (
            "❌ Не удалось распознать чек. Попробуйте:\n"
            "  • Сфотографировать ровно, без наклона и теней\n"
            "  • Если чек выцветший — запросите дубликат в аптеке (хранят 5 лет)"
        )

    @staticmethod
    def _source_label(source: str) -> str:
        if "qr_fns" in source:    return "ФНС"
        if "merged" in source:    return "ФНС + OCR"
        if "easyocr" in source:   return "OCR EasyOCR"
        if "tesseract" in source: return "OCR Tesseract"
        return source


# ─── Главный пайплайн ────────────────────────────────────────────

class ReceiptOCRPipeline:
    """
    Точка входа для всего OCR пайплайна.

    Запускает QR→ФНС и EasyOCR параллельно через asyncio,
    затем объединяет результаты через ResultMerger.

    Использование:
        pipeline = ReceiptOCRPipeline()
        result = await pipeline.process("receipt.jpg")
        print(result.status, result.receipt.total_amount)
        print(result.user_hint)
    """

    DONE_THRESHOLD   = 0.85
    REVIEW_THRESHOLD = 0.60

    def __init__(self, use_gpu: bool = False):
        self.qr_scanner    = QRReceiptScanner()
        self.ocr_scanner   = OCRReceiptScanner(use_gpu=use_gpu)
        self.age_estimator = ReceiptAgeEstimator()
        self.merger        = ResultMerger()
        self.hint_gen      = UserHintGenerator()

    async def process(self, image_path: str | Path) -> PipelineResult:
        """
        Параллельная обработка: QR+ФНС и OCR запускаются одновременно.
        Общее время ≈ max(t_fns, t_ocr) вместо t_fns + t_ocr.
        """
        image_path = Path(image_path)
        logger.info(f"═══ Параллельная обработка: {image_path.name} ═══")

        # ── Быстрое декодирование QR (sync, < 0.5 сек) ───────────
        qr_data = self.qr_scanner.qr_decoder.decode(image_path)
        qr_raw  = qr_data.raw if qr_data else None

        # Нужно ли идти в ФНС?
        if qr_data is None:
            skip_fns, skip_reason = True, "нет QR-кода"
        elif not self.age_estimator.is_fns_reliable(qr_raw):
            skip_fns, skip_reason = True, "чек старше 12 мес."
        else:
            skip_fns, skip_reason = False, ""

        # ── Параллельный запуск ───────────────────────────────────
        loop = asyncio.get_running_loop()

        # OCR в отдельном потоке (CPU-bound, не блокирует event loop)
        ocr_coro = loop.run_in_executor(
            _ocr_executor,
            self.ocr_scanner.scan,
            image_path,
        )

        if not skip_fns:
            logger.info("Запуск параллельно: ФНС API + OCR")
            fns_coro = self._fetch_fns(qr_data)
            fns_result, ocr_result = await asyncio.gather(
                fns_coro, ocr_coro,
                return_exceptions=True,
            )
        else:
            logger.info(f"ФНС пропущен ({skip_reason}) → только OCR")
            fns_result = None
            ocr_result = await ocr_coro

        # Обрабатываем исключения из gather
        if isinstance(fns_result, Exception):
            logger.error(f"ФНС упал: {fns_result}")
            fns_result = None
        if isinstance(ocr_result, Exception):
            logger.error(f"OCR упал: {ocr_result}")
            ocr_result = None

        # ── Merge ─────────────────────────────────────────────────
        final_receipt, strategy = self.merger.merge(fns_result, ocr_result)
        status = self._determine_status(final_receipt)

        self._log_summary(strategy, fns_result, ocr_result, final_receipt, status)

        result = PipelineResult(
            receipt        = final_receipt,
            status         = status,
            fns_result     = fns_result,
            ocr_result     = ocr_result,
            merge_strategy = strategy,
            amount_match   = self.merger._amounts_match(
                fns_result.total_amount if fns_result else None,
                ocr_result.total_amount if ocr_result else None,
            ),
            date_match     = self.merger._dates_match(
                fns_result.purchase_date if fns_result else None,
                ocr_result.purchase_date if ocr_result else None,
            ),
        )
        result.user_hint = self.hint_gen.generate(result)
        return result

    async def _fetch_fns(self, qr_data) -> Optional[ParsedReceipt]:
        """QR уже декодирован — сразу идём в ФНС без повторного decode."""
        try:
            receipt = await self.qr_scanner.fns_client.get_receipt(qr_data)
            if receipt is None:
                return self.qr_scanner._receipt_from_qr_only(qr_data)
            return receipt
        except Exception as e:
            logger.error(f"ФНС запрос упал: {e}")
            return None

    def _determine_status(self, receipt: ParsedReceipt) -> OCRStatus:
        if not receipt or (receipt.error and receipt.confidence < 0.1):
            return OCRStatus.FAILED
        if receipt.confidence >= self.DONE_THRESHOLD:
            return OCRStatus.DONE
        if receipt.confidence >= self.REVIEW_THRESHOLD:
            return OCRStatus.REVIEW
        return OCRStatus.FAILED

    def _log_summary(self, strategy, fns, ocr, final, status):
        icon = {"done": "✅", "review": "⚠️ ", "failed": "❌"}.get(status.value, "?")
        logger.info(
            f"{icon} [{strategy}] "
            f"ФНС={'conf='+f'{fns.confidence:.2f}' if fns else 'нет'} | "
            f"OCR={'conf='+f'{ocr.confidence:.2f}' if ocr else 'нет'} | "
            f"итог conf={final.confidence:.2f} → {status.value.upper()}"
        )


# ─── Celery Task ─────────────────────────────────────────────────

# from celery import Celery
# celery_app = Celery("medvychet", broker="redis://localhost:6379/0")
#
# @celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
# def process_receipt_task(self, receipt_id: str, image_s3_key: str):
#     import asyncio
#     from storage import download_from_s3
#     from db import save_pipeline_result
#     try:
#         local_path = download_from_s3(image_s3_key)
#         pipeline   = ReceiptOCRPipeline()
#         result     = asyncio.run(pipeline.process(local_path))
#         save_pipeline_result(receipt_id, result)
#         notify_telegram(receipt_id, result.user_hint)
#     except Exception as exc:
#         raise self.retry(exc=exc)


# ─── CLI + тесты ─────────────────────────────────────────────────

async def main():
    import sys
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    if len(sys.argv) > 1:
        pipeline = ReceiptOCRPipeline()
        result   = await pipeline.process(sys.argv[1])
        r = result.receipt
        print(f"\n{'═'*55}")
        print(f"  Статус:        {result.status.value.upper()}")
        print(f"  Стратегия:     {result.merge_strategy}")
        print(f"  Источник:      {r.source}")
        print(f"  Уверенность:   {r.confidence:.1%}")
        print(f"  Дата:          {r.purchase_date or 'не найдена'}")
        print(f"  Аптека:        {r.pharmacy_name or 'не найдена'}")
        print(f"  ИНН аптеки:    {r.pharmacy_inn or 'не найден'}")
        print(f"  Сумма:         {r.total_amount:.2f} руб.")
        print(f"  Позиций:       {len(r.items)}")
        for item in r.items:
            print(f"    • {item.name}: {item.total:.2f} руб.")
        if result.fns_result:
            print(f"\n  ФНС: conf={result.fns_result.confidence:.2f}, "
                  f"позиций={len(result.fns_result.items)}")
        if result.ocr_result:
            print(f"  OCR: conf={result.ocr_result.confidence:.2f}, "
                  f"позиций={len(result.ocr_result.items)}")
        print(f"\n  Совпадение сумм: {'✓' if result.amount_match else '✗'}")
        print(f"  Совпадение дат:  {'✓' if result.date_match else '✗'}")
        print(f"\n  → {result.user_hint}")
        print(f"{'═'*55}\n")

    else:
        # Тесты без реального файла
        print("\n=== MedВычет OCR Pipeline v2 (параллельный) ===")
        print("Использование: python pipeline.py /path/to/receipt.jpg\n")

        from step1_qr_scanner import ParsedReceipt as PR, ReceiptItem as RI
        merger = ResultMerger()
        est    = ReceiptAgeEstimator()
        items  = [RI("Омепразол капс 20мг", 1, 450.0, 450.0),
                  RI("Лоратадин таб 10мг",  2, 400.0, 800.0)]

        fns = PR(source="qr_fns", purchase_date=datetime(2024,3,15,12,0),
                 pharmacy_name="Аптека Здоровье", pharmacy_inn="7701234567",
                 total_amount=1250.0, confidence=1.0, items=items)

        cases = [
            # (fns, ocr, ожидаемая_стратегия, описание)
            (fns,
             PR(source="ocr_easyocr", purchase_date=datetime(2024,3,15),
                pharmacy_name=None, pharmacy_inn=None,
                total_amount=1248.0, confidence=0.82, items=[]),
             "merged", "суммы совпали (разница 2 руб.)"),

            (fns,
             PR(source="ocr_easyocr", purchase_date=datetime(2024,3,15),
                pharmacy_name=None, pharmacy_inn=None,
                total_amount=890.0, confidence=0.71, items=[]),
             "conflict", "суммы расходятся"),

            (None,
             PR(source="ocr_easyocr", purchase_date=datetime(2024,3,15),
                pharmacy_name="Аптека", pharmacy_inn=None,
                total_amount=500.0, confidence=0.78, items=[]),
             "ocr_only", "нет QR"),

            (fns, None, "fns_only", "только ФНС"),
            (None, None, "both_failed", "оба упали"),
        ]

        print("=== Тест ResultMerger ===")
        all_ok = True
        for fns_r, ocr_r, expected, desc in cases:
            r, s = merger.merge(fns_r, ocr_r)
            ok   = s == expected
            all_ok = all_ok and ok
            print(f"  {'✅' if ok else '❌'} {desc}: strategy={s}, conf={r.confidence:.2f}")

        print("\n=== Тест ReceiptAgeEstimator ===")
        fresh = f"t={datetime.now().strftime('%Y%m%d')}T1200&s=100.00&fn=1&i=1&fp=1"
        old   = "t=20220101T1200&s=100.00&fn=1&i=1&fp=1"
        r1 = est.is_fns_reliable(fresh)
        r2 = est.is_fns_reliable(old)
        r3 = est.is_fns_reliable(None)
        print(f"  {'✅' if r1 else '❌'} Свежий чек → reliable={r1}")
        print(f"  {'✅' if not r2 else '❌'} Чек 2022  → reliable={r2}")
        print(f"  {'✅' if r3 else '❌'} Нет QR    → reliable={r3} (пробуем ФНС)")

        print(f"\n{'✅ Все тесты пройдены' if all_ok and r1 and not r2 and r3 else '❌ Есть ошибки'}")
        print("\nСхема пайплайна v2:")
        print("  Фото → QR decode (sync)")
        print("           ├─ QR есть + чек < 12 мес:")
        print("           │     ├── [async] ФНС API ────────┐")
        print("           │     └── [thread] EasyOCR ────────┤ ResultMerger → DONE/REVIEW/FAILED")
        print("           └─ нет QR / чек старый:")
        print("                 └── [thread] EasyOCR ────────┘")


if __name__ == "__main__":
    asyncio.run(main())
