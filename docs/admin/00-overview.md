# Обзор инфраструктуры MedВычет

## Описание платформы

**MedВычет** — SaaS-платформа автоматизации налогового вычета на лекарства (ст. 219 НК РФ). Пользователи фотографируют чеки из аптек, система распознаёт их через OCR/QR, привязывает рецепты и генерирует пакет документов для подачи в ИФНС.

---

## Архитектура сервисов

```
                        Интернет
                            │
                    ┌───────▼────────┐
                    │  Nginx (HTTPS)  │
                    │  :80 / :443     │
                    └───┬────────┬───┘
                        │        │
            ┌───────────▼──┐  ┌──▼──────────────┐
            │  Frontend     │  │  Backend API     │
            │  Next.js :3000│  │  FastAPI :8000   │
            └───────────────┘  └──┬───────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
             ┌──────▼──────┐  ┌───▼───┐  ┌──────▼──────┐
             │  PostgreSQL  │  │ Redis  │  │    Yandex   │
             │  :5432 (RLS) │  │ :6379  │  │    Cloud S3 │
             └──────────────┘  └───┬───┘  └─────────────┘
                                   │
                         ┌─────────▼─────────┐
                         │   Celery Worker    │
                         │   (OCR + Batch)    │
                         └───────────────────┘

                         ┌─────────────────────┐
                         │   Telegram Bot       │
                         │   (polling/webhook)  │
                         └─────────────────────┘
```

## Контейнеры (docker-compose)

| Сервис          | Image / Build         | Порт (хост→контейнер) | Назначение                       |
|-----------------|-----------------------|-----------------------|----------------------------------|
| `postgres`      | postgres:15           | —                     | Основная БД с RLS                |
| `redis`         | redis:7-alpine        | —                     | Очередь задач + SSE PubSub       |
| `backend`       | ./backend/Dockerfile  | 127.0.0.1:8000→8000   | FastAPI REST API                 |
| `celery_worker` | ./backend/Dockerfile  | —                     | Воркер: OCR, batch, cleanup      |
| `bot`           | ./bot/Dockerfile      | —                     | Telegram бот                     |
| `frontend`      | ./frontend/Dockerfile | 127.0.0.1:3000→3000   | Next.js веб-приложение           |

---

## Yandex Cloud

### Используемые сервисы

| Сервис YC              | Назначение в проекте                           |
|------------------------|------------------------------------------------|
| **Compute Cloud (VM)** | Хостинг всего стека на VDS/VPS                 |
| **Object Storage**     | Хранение фото чеков, рецептов, ZIP-экспортов   |
| **Certificate Manager** | TLS-сертификаты (опционально, либо Let's Encrypt) |

### Yandex Object Storage (S3)

Endpoint: `https://storage.yandexcloud.net`
Регион: `ru-central1`

Используемые бакеты:

| Переменная               | Имя бакета                   | Содержимое                    |
|--------------------------|------------------------------|-------------------------------|
| `YOS_BUCKET_RECEIPTS`    | `medvychet-receipts`         | Фото чеков от пользователей   |
| `YOS_BUCKET_PRESCRIPTIONS`| `medvychet-prescriptions`   | Сканы/фото рецептов           |
| `YOS_BUCKET_EXPORTS`     | `medvychet-exports`          | ZIP-архивы для скачивания     |

Доступ — только через pre-signed URL с TTL 15 минут. Публичный доступ к бакетам **отключён**.

### Создание IAM-ключей для Object Storage

1. Перейти в [Yandex Cloud Console](https://console.yandex.cloud)
2. IAM → Сервисные аккаунты → создать аккаунт `medvychet-s3`
3. Назначить роль `storage.editor` на нужные бакеты
4. Создать статический ключ доступа: вкладка "Ключи доступа" → Создать
5. Скопировать `Access Key ID` → `YOS_ACCESS_KEY` и `Secret Key` → `YOS_SECRET_KEY`

> **Важно**: Secret Key показывается только один раз — сохраните сразу в `.env`.

### Создание бакетов

```bash
# Через AWS CLI (совместимый с YOS)
aws s3 mb s3://medvychet-receipts \
  --endpoint-url https://storage.yandexcloud.net \
  --region ru-central1

aws s3 mb s3://medvychet-prescriptions \
  --endpoint-url https://storage.yandexcloud.net \
  --region ru-central1

aws s3 mb s3://medvychet-exports \
  --endpoint-url https://storage.yandexcloud.net \
  --region ru-central1
```

Либо через веб-консоль: Object Storage → Создать бакет → выбрать регион `ru-central1`, доступ — **Закрытый**.

---

## Конфигурация (.env)

Все сервисы читают конфигурацию из файла `.env` в корне репозитория.
Шаблон находится в `.env.example`.

### Основные переменные

```env
# PostgreSQL
DATABASE_URL=postgresql+asyncpg://medvychet:PASSWORD@postgres:5432/medvychet
DATABASE_URL_WORKER=postgresql+asyncpg://medvychet_worker:PASSWORD@postgres:5432/medvychet
POSTGRES_PASSWORD=PASSWORD

# Redis
REDIS_URL=redis://redis:6379/0

# Yandex Object Storage
YOS_ACCESS_KEY=<ключ из IAM>
YOS_SECRET_KEY=<секрет из IAM>
YOS_ENDPOINT=https://storage.yandexcloud.net
YOS_REGION=ru-central1
YOS_BUCKET_RECEIPTS=medvychet-receipts
YOS_BUCKET_PRESCRIPTIONS=medvychet-prescriptions
YOS_BUCKET_EXPORTS=medvychet-exports

# Telegram
TELEGRAM_BOT_TOKEN=<токен от @BotFather>
TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 24>

# Безопасность
JWT_SECRET_KEY=<openssl rand -hex 32>
ENCRYPTION_KEY=<openssl rand -base64 32>

# Sentry (опционально)
SENTRY_DSN=

# Окружение
ENVIRONMENT=production
DEBUG=false
FRONTEND_URL=https://medvychet.systemtool.online
BACKEND_URL=https://medvychet.systemtool.online
```

---

## Первый запуск

```bash
# 1. Клонировать репозиторий
git clone <repo_url> && cd medical-tax-deduction

# 2. Создать .env из шаблона и заполнить
cp .env.example .env
nano .env

# 3. Запустить стек
docker compose -f infra/docker-compose.yml up -d --build

# 4. Применить миграции БД
docker compose -f infra/docker-compose.yml exec backend alembic upgrade head

# 5. Проверить здоровье
curl http://localhost:8000/api/v1/health
```

---

## Мониторинг и алерты

| Инструмент    | Назначение                          | Конфигурация         |
|---------------|-------------------------------------|----------------------|
| **Sentry**    | Ошибки приложения, трассировки      | `SENTRY_DSN` в .env  |
| **Prometheus**| Метрики (latency, RPS, queue depth) | `/metrics` endpoint  |
| **Grafana**   | Дашборды метрик                     | Отдельный контейнер  |

---

## Документация по модулям

- [01-backend.md](./01-backend.md) — FastAPI Backend
- [02-celery-worker.md](./02-celery-worker.md) — Celery Worker (OCR)
- [03-frontend.md](./03-frontend.md) — Next.js Frontend
- [04-bot.md](./04-bot.md) — Telegram Bot
- [05-postgres.md](./05-postgres.md) — PostgreSQL
- [06-redis.md](./06-redis.md) — Redis
- [07-nginx.md](./07-nginx.md) — Nginx
