# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MedВычет** — SaaS-платформа автоматизации налогового вычета на лекарства (ст. 219 НК РФ). Пользователи фотографируют чеки из аптек, система распознаёт их через OCR/QR, привязывает рецепты и генерирует пакет документов для подачи в ИФНС.

**Статус**: проект в стадии разработки.

## Стек

| Компонент        | Технология                                                 |
| ---------------- | ---------------------------------------------------------- |
| Backend API      | Python / FastAPI + Uvicorn                                 |
| OCR Worker       | Celery + EasyOCR / Tesseract / OpenAI Vision (fallback)    |
| База данных      | PostgreSQL 15 с RLS                                        |
| Очередь          | Redis + Celery                                             |
| Хранилище файлов | Yandex Object Storage (boto3, S3-совместимый)              |
| Telegram-бот     | python-telegram-bot 21                                     |
| Frontend         | Next.js 15 App Router, TypeScript, Tailwind CSS, ShadCN/ui |
| State            | TanStack React Query + Zustand                             |
| PDF              | ReportLab (реестры) + WeasyPrint (письма)                  |
| Мониторинг       | Sentry + Prometheus + Grafana                              |

## Команды разработки

```bash
# Docker Compose (запуск полного стека)
cd infra
docker compose up -d --build

# Backend (локально)
cd backend && uv sync
uvicorn app.main:app --reload --port 8000
celery -A workers.celery_app worker --loglevel=info  # отдельный терминал

# Bot (локально, polling-режим)
cd bot && uv sync
python main.py

# Frontend (локально)
cd frontend && npm install && npm run dev

# Миграции БД
cd backend && alembic upgrade head
alembic revision --autogenerate -m "description"

# Тесты и линтинг
cd backend && pytest                          # все тесты
cd backend && pytest tests/test_ocr/          # конкретная папка
cd backend && pytest tests/test_models.py -v  # один файл
cd backend && ruff check . && mypy .
cd frontend && npm run lint && npm run tsc
```

> **После любых изменений frontend** — пересобрать и задеплоить в Docker:
> `cd infra && docker compose up -d --build frontend`

## Архитектура

### Backend (`backend/app/`)

- `routers/` — FastAPI эндпоинты (auth, receipts, batch, prescriptions, export, documents, calculator, admin)
- `services/` — бизнес-логика: `ocr/`, `auth/`, `export/`, `storage/`, `dedup/`, `deduction/`
- `repositories/` — data access layer (асинхронные SQLAlchemy запросы)
- `models/` — SQLAlchemy ORM (SQLAlchemy TypeDecorator `EncryptedString` для ПД)
- `schemas/` — Pydantic v2 модели
- `middleware/rls.py` — RLS middleware: каждый запрос устанавливает `app.current_user_id` в PostgreSQL
- `workers/tasks/` — Celery задачи: `ocr_task`, `batch_task`, `export_task`, `cleanup_task`
- `workers/sse_publisher.py` — SSE-стриминг прогресса batch-обработки через Redis

### OCR-пайплайн (`services/ocr/`)

```
Фото чека
    ├─► qr_scanner.py  (pyzbar, 5 стратегий декодирования) ─┐
    │                                                         ├─► ocr_result.py (ResultMerger) ─► drug_normalizer.py ─► БД
    └─► pipeline.py    (EasyOCR → Tesseract → OpenAI Vision) ─┘

Confidence: ≥0.85 → DONE  |  0.60–0.84 → REVIEW  |  <0.60 → FAILED
```

- `dedup/receipt_dedup.py` и `dedup/prescription_dedup.py` — дедупликация по хешам перед сохранением

### Frontend (`frontend/src/`)

- `app/(auth)/` — страницы авторизации
- `app/(cabinet)/` — защищённые страницы ЛК (dashboard, receipts, prescriptions, review, export, profile, duplicates, s3-cleanup)
- `lib/api.ts` — Fetch wrapper с автоматическим refresh JWT (401 → refresh → retry)
- `lib/store.ts` — Zustand: `authStore`, `batchStore`, `reviewStore`
- `hooks/useBatchSSE.ts` — SSE-клиент для real-time прогресса batch-загрузки

### Telegram-бот (`bot/`)

- `handlers/` — `receipt_flow.py` (загрузка чеков), `prescription_dialog.py`, `conversations.py`, `commands.py`
- `services/` — вспомогательные сервисы бота
- Работает в polling-режиме (без WEBHOOK_URL) или в webhook-режиме при наличии `WEBHOOK_URL`

## Дизайн-система HEITKAMP (Frontend)

**Обязательна** для всех страниц и компонентов.

- `proekt/design/heitkamp/heitkamp-ds.css` — готовые CSS-классы и переменные
- `proekt/design/heitkamp/design-tokens-heitkamp.json` — все токены

Правила:
1. Шрифт **Urbanist** (Google Fonts, weights 300–800)
2. CSS-переменные: `--accent`, `--bg`, `--surface`, `--sidebar-bg`
3. Готовые классы: `.card`, `.btn-primary`, `.badge-*`, `.kpi-card`, `.sidebar`, `.nav-item`, `.topbar`
4. Не переопределять токены HEITKAMP своими цветами. Акцент: `#7B6FD4`, фон: `#F2F2F7`, карточки: `#FFFFFF`, sidebar: `#1A1A2E`

## Безопасность и 152-ФЗ

- Номера телефонов → bcrypt hash; ФИО / ИНН / СНИЛС → AES-256 (`EncryptedString` TypeDecorator)
- PostgreSQL RLS: `app.current_user_id` устанавливается через `RLSMiddleware` на каждый запрос
- JWT: httpOnly cookie, access TTL 15 мин, refresh TTL 30 дней с rotation
- Presigned S3 URL TTL 15 мин; все данные хранятся только в РФ (Yandex Object Storage)

## Инструкции по работе

Always use Context7 when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

Если я даю тебе слишком большие задачи, разбивай их на маленькие атомарные и решай их постепенно, для лучшего понимания контекста.

## gstack (REQUIRED — global install)

**Before doing ANY work, verify gstack is installed:**

```bash
test -d ~/.claude/skills/gstack/bin && echo "GSTACK_OK" || echo "GSTACK_MISSING"
```

If GSTACK_MISSING: STOP. Do not proceed. Tell the user:

> gstack is required for all AI-assisted work in this repo.
> Install it:
> ```bash
> git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
> cd ~/.claude/skills/gstack && ./setup --team
> ```
> Then restart your AI coding tool.

Do not skip skills, ignore gstack errors, or work around missing gstack.

Using gstack skills: After install, skills like /qa, /ship, /review, /investigate,
and /browse are available. Use /browse for all web browsing.
Use ~/.claude/skills/gstack/... for gstack file paths (the global path).
