# МедВычет

SaaS-платформа автоматизации налогового вычета на лекарства по ст. 219 НК РФ.

Пользователи фотографируют чеки из аптек — система распознаёт их через OCR/QR, привязывает рецепты и генерирует пакет документов для подачи в ИФНС.

## Возможности

- **OCR-пайплайн** — параллельное распознавание QR-кода и текста (EasyOCR + Tesseract fallback), слияние результатов по 6 стратегиям
- **Пакетная загрузка** — до 10 чеков за раз через Telegram или веб, real-time прогресс по SSE
- **Привязка рецептов** — поиск L1–L4 (точный МНН → аптека → период → fuzzy), ручной ввод
- **Telegram-бот** — авторизация по OTP, загрузка чеков, команды `/summary`, `/export`
- **Личный кабинет** — Next.js Mini App внутри Telegram и отдельный веб-интерфейс
- **Экспорт** — PDF-реестр (ReportLab A4), сопроводительное письмо (WeasyPrint), ZIP-архив
- **Безопасность** — RLS PostgreSQL, AES-256 для ПД, httpOnly JWT, presigned S3 URL TTL 15 мин, 152-ФЗ

## Стек

| Компонент | Технология |
|-----------|-----------|
| Backend API | Python / FastAPI + Uvicorn |
| OCR Worker | Celery + EasyOCR / Tesseract |
| База данных | PostgreSQL 15 с RLS |
| Очередь | Redis + Celery |
| Хранилище | Yandex Object Storage (S3-совместимый) |
| Telegram-бот | python-telegram-bot 21 |
| Frontend | Next.js 15, TypeScript, Tailwind CSS, ShadCN/ui |
| PDF | ReportLab + WeasyPrint |
| Мониторинг | Sentry + Prometheus + Grafana |

## Структура репозитория

```
medical-tax-deduction/
├── backend/          # FastAPI + Celery
│   ├── alembic/      # Миграции БД (0001–0005)
│   ├── app/
│   │   ├── middleware/   # RLS middleware
│   │   ├── models/       # SQLAlchemy ORM
│   │   ├── schemas/      # Pydantic v2
│   │   ├── routers/      # API endpoints
│   │   ├── services/     # OCR, auth, export, storage
│   │   └── repositories/ # Data access layer
│   └── workers/      # Celery tasks + SSE publisher
├── bot/              # Telegram-бот (python-telegram-bot 21)
├── frontend/         # Next.js 15 App Router
├── infra/            # Docker Compose + Nginx
└── proekt/           # PRD, задачи, прогресс
```

## Быстрый старт

### Требования

- Docker + Docker Compose
- Аккаунт Yandex Cloud (Object Storage)
- Telegram-бот (через @BotFather)

### 1. Настройка переменных окружения

```bash
cp .env.example .env
```

Заполнить в `.env`:

| Переменная | Где получить |
|-----------|-------------|
| `YOS_ACCESS_KEY` / `YOS_SECRET_KEY` | Yandex Cloud → IAM → Сервисные аккаунты |
| `TELEGRAM_BOT_TOKEN` | @BotFather → `/newbot` |
| `JWT_SECRET_KEY` | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` |
| `TELEGRAM_WEBHOOK_SECRET` | `openssl rand -hex 24` |

### 2. Запуск через Docker Compose

```bash
docker compose -f infra/docker-compose.yml up --build
```

Сервисы:
- Backend API: http://localhost:8000
- Frontend: http://localhost:3000
- PostgreSQL: localhost:5432
- Redis: localhost:6379

### 3. Миграции БД

```bash
docker compose -f infra/docker-compose.yml exec backend alembic upgrade head
```

## Локальная разработка

### Backend

```bash
cd backend
uv sync
uvicorn app.main:app --reload --port 8000
# В отдельном терминале:
celery -A workers.celery_app worker --loglevel=info
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

### Telegram-бот

```bash
cd bot
uv sync
python main.py   # polling-режим (без WEBHOOK_URL)
```

## Тесты

```bash
cd backend
pytest                          # все тесты
pytest tests/test_ocr/          # только OCR
pytest tests/test_export/       # только экспорт
```

## Линтинг

```bash
# Backend
cd backend && ruff check . && mypy .

# Frontend
cd frontend && npm run lint && npm run tsc
```

## Архитектура OCR-пайплайна

```
Фото чека
    │
    ├─► QR decode (pyzbar, 5 стратегий)  ─┐
    │                                      ├─► ResultMerger ─► DrugNormalizer ─► БД
    └─► EasyOCR → Tesseract fallback      ─┘

Confidence: ≥0.85 → DONE  |  0.60–0.84 → REVIEW  |  <0.60 → FAILED
```

## Безопасность и 152-ФЗ

- Все данные хранятся только в РФ (Yandex Object Storage)
- Номера телефонов → bcrypt hash
- ФИО / ИНН / СНИЛС → AES-256 (`EncryptedString` TypeDecorator)
- PostgreSQL RLS: каждый запрос выполняется в контексте `app.current_user_id`
- JWT: httpOnly cookie, access TTL 15 мин, refresh TTL 30 дней с rotation

## Лицензия

Proprietary. Все права защищены.
