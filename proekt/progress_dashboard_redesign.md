# Progress — Dashboard Redesign

## Статус задач

| ID | Описание | Статус | Дата |
|----|----------|--------|------|
| TASK-001 | Backend: роутер tax_limits.py | done | 2026-04-03 |
| TASK-002 | Backend: зарегистрировать роутер в main.py | done | 2026-04-03 |
| TASK-003 | Frontend: хук useTaxLimits(year) | pending | — |
| TASK-004 | Frontend: глобальный year state | pending | — |
| TASK-005 | Панель 1: замена надписи на «Социальный вычет» | pending | — |
| TASK-006 | Панель 1: кнопка «i» с tooltip и ссылкой | pending | — |
| TASK-007 | Панель 1: расширяемый список типов вычетов | pending | — |
| TASK-008 | Страница /info/social-vychet | pending | — |
| TASK-009 | Панель 2: компонент YearFilter | pending | — |
| TASK-010 | Панель 3: компонент BigGlass | pending | — |
| TASK-011 | Панель 3: компонент SmallGlass | pending | — |
| TASK-012 | Панель 3: сборка LimitsPanel + API | pending | — |
| TASK-013 | Панель 4: компонент DocumentGroup | pending | — |
| TASK-014 | Панель 4: сборка DocumentsPanel + API | pending | — |
| TASK-015 | Удалить старые панели 4/5/6 | pending | — |
| TASK-016 | Интеграция всех панелей в DashboardContent | pending | — |
| TASK-017 | Заменить эмодзи на Lucide Icons в HeroCard | pending | — |
| TASK-018 | Backend: unit-тест для tax-limits эндпоинта | pending | — |
| TASK-019 | Backend: эндпоинт /api/v1/expenses/categories?year= | done | 2026-04-03 |
| TASK-020 | Backend: модель Document (справки, ДМС, 2-НДФЛ) + миграция | pending | — |
| TASK-021 | Backend: эндпоинт /api/v1/documents/stats?year= | pending | — |
| TASK-022 | Frontend: типы и хуки useExpenseCategories + useDocumentStats | pending | — |

---

## Лог изменений

<!-- Агент добавляет запись после каждой выполненной задачи в формате:
### TASK-XXX — [дата]
**Что сделано:** краткое описание изменений
**Файлы изменены:** список файлов
**Тесты:** пройдены / не пройдены (причина)
-->

### TASK-001 + TASK-002 — 2026-04-03
**Что сделано:** Роутер tax_limits.py уже существовал и был зарегистрирован в main.py. Статусы обновлены до done.
**Файлы изменены:** backend/app/routers/tax_limits.py (уже был), backend/app/main.py (уже был подключён)
**Тесты:** 54 теста deduction-движка пройдены

### TASK-019 — 2026-04-03
**Что сделано:** Создан `backend/app/routers/expenses.py` с эндпоинтом `GET /api/v1/expenses/categories?year={year}`. Возвращает расходы пользователя по всем 8 категориям ExpenseCategory (amount=0 если нет данных). Эндпоинт зарегистрирован в main.py.
**Файлы изменены:** backend/app/routers/expenses.py (создан), backend/app/main.py (добавлен import и include_router)
**Тесты:** ruff check — чисто для изменённых файлов. 54 теста deduction-движка пройдены. Следующий шаг: TASK-020 (Document model + migration) → TASK-021 (documents/stats endpoint) → TASK-022 (frontend hooks).
