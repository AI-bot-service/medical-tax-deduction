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

## Деплой на новый сервер

### Требования
- Docker, nginx, git установлены
- SSH-ключ добавлен в GitHub (repo: `AI-bot-service/medical-tax-deduction`)

### Порядок действий

```bash
# 1. Создать папку и клонировать (без sudo!)
sudo mkdir -p /opt/medvychet && sudo chown $USER:$USER /opt/medvychet
git clone git@github.com:AI-bot-service/medical-tax-deduction.git /opt/medvychet

# 2. Скопировать .env со старого сервера
scp user@OLD_SERVER:/opt/medvychet/.env /opt/medvychet/.env

# 3. ВАЖНО: создать симлинк .env в папке infra
# docker compose ищет переменные (${POSTGRES_PASSWORD} и др.) в infra/.env,
# а не в родительской папке — без симлинка POSTGRES_PASSWORD будет пустым
ln -s /opt/medvychet/.env /opt/medvychet/infra/.env

# 4. Запустить postgres и залить дамп БД
cd /opt/medvychet/infra
docker compose up -d postgres
# (подождать статус healthy)
docker compose exec -T postgres psql -U medvychet medvychet < ~/medvychet_backup.sql

# 5. Запустить всё
docker compose up -d --build

# 6. Настроить nginx
# Конфиг: /etc/nginx/sites-available/medvychet (см. текущий сервер)
# SSL-сертификаты: /etc/ssl/medvychet/fullchain.pem и key.pem
ln -s /etc/nginx/sites-available/medvychet /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### Что не в гите — перенести вручную
| Данные | Путь |
|---|---|
| Переменные окружения | `/opt/medvychet/.env` |
| База данных | дамп через `pg_dump` → `psql` |
| SSL-сертификаты | `/etc/ssl/medvychet/` |

> Фото чеков/рецептов в Yandex Object Storage — переезжают автоматически через `.env`.

Если я даю тебе слишком большие задачи, разбивай их на маленькие атомарные и решай их постепенно, для лучшего понимания контекста.