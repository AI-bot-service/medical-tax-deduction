"""Движок расчёта социального налогового вычета (ст. 219 НК РФ).

Чистый Python без зависимостей от SQLAlchemy/FastAPI/Pydantic.
"""

from .calculator import calculate_deduction
from .family_optimizer import optimize_family
from .year_planner import plan_expenses_across_years

__all__ = ["calculate_deduction", "optimize_family", "plan_expenses_across_years"]
