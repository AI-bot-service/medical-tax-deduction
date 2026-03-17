"""Drug Normalizer: сопоставление названий препаратов с реестром ГРЛС (B-06)."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

from rapidfuzz import fuzz

logger = logging.getLogger(__name__)

MATCH_THRESHOLD = 80
_GRLS_PATH = Path(__file__).parent.parent.parent.parent / "data" / "grls_drugs.json"


@dataclass(frozen=True)
class DrugMatch:
    drug_inn: str
    display_name: str
    is_rx: bool
    match_score: float


class DrugNormalizer:
    """Сингл-инстанс нормализатор: загружает ГРЛС один раз, кэширует результаты."""

    def __init__(self, grls_path: Path | None = None) -> None:
        path = grls_path or _GRLS_PATH
        with open(path, encoding="utf-8") as f:
            self._grls: list[dict] = json.load(f)
        self._cache: dict[str, DrugMatch | None] = {}

    def normalize(self, drug_name: str) -> DrugMatch | None:
        """Возвращает DrugMatch для drug_name или None если совпадение < порога."""
        key = drug_name.strip().lower()
        if key in self._cache:
            return self._cache[key]

        best: DrugMatch | None = None
        best_score = 0.0

        for entry in self._grls:
            inn: str = entry["drug_inn"]
            trade_names: list[str] = entry.get("trade_names", [])
            is_rx: bool = entry.get("is_rx", False)

            # Сравниваем с МНН
            score = fuzz.WRatio(key, inn.lower())
            if score > best_score:
                best_score = score
                best = DrugMatch(
                    drug_inn=inn,
                    display_name=inn,
                    is_rx=is_rx,
                    match_score=score,
                )

            # Сравниваем с торговыми названиями
            for trade in trade_names:
                score = fuzz.WRatio(key, trade.lower())
                if score > best_score:
                    best_score = score
                    best = DrugMatch(
                        drug_inn=inn,
                        display_name=trade,
                        is_rx=is_rx,
                        match_score=score,
                    )

        result = best if best_score >= MATCH_THRESHOLD else None
        self._cache[key] = result
        return result

    def normalize_receipt_items(
        self, items: list[str]
    ) -> list[DrugMatch | None]:
        """Пакетная нормализация списка строк."""
        return [self.normalize(item) for item in items]


# Singleton instance
_normalizer: DrugNormalizer | None = None


def get_drug_normalizer() -> DrugNormalizer:
    """Возвращает singleton DrugNormalizer (ленивая инициализация)."""
    global _normalizer
    if _normalizer is None:
        _normalizer = DrugNormalizer()
    return _normalizer
