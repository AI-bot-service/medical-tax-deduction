# CLAUDE.md

## Project Overview

**MedВычет** — SaaS-платформа автоматизации налогового вычета на лекарства (ст. 219 НК РФ). Пользователи фотографируют чеки из аптек, система распознаёт их через OCR/QR, привязывает рецепты и генерирует пакет документов для подачи в ИФНС.

**Статус**: проект в стадии разработки. 

## Стек

| Компонент        | Технология                                                 |
| ---------------- | ---------------------------------------------------------- |
| Backend API      | Python / FastAPI + Uvicorn                                 |
| OCR Worker       | Celery + EasyOCR / Tesseract                               |
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
# Запуск всего стека
docker compose up --build

# Backend
cd backend && uv sync
uvicorn app.main:app --reload --port 8000
celery -A workers.celery_app worker --loglevel=info

# Bot
cd bot && uv sync
python main.py

# Frontend
cd frontend && npm install && npm run dev

# Миграции БД
cd backend && alembic upgrade head
alembic revision --autogenerate -m "description"

# Тесты и линтинг
cd backend && pytest
cd backend && ruff check . && mypy .
cd frontend && npm run lint && npm run tsc
```


Always use Context7 when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

Если я даю тебе слишком большие задачи, разбивай их на маленькие атомарные и решай их постепенно, для лучшего понимания контекста.