# Backend (FastAPI)

## Описание

REST API сервер на FastAPI + Uvicorn. Обрабатывает все HTTP-запросы от фронтенда и бота, управляет аутентификацией, запускает Celery-задачи, отдаёт SSE-поток прогресса.

**Контейнер Docker Compose:** `backend`
**Порт:** `127.0.0.1:8000` (доступен только через Nginx)

---

## Настройки модуля

Все настройки читаются из `.env` через `backend/app/config.py` (Pydantic Settings).

| Переменная           | Обязательная | Описание                                               |
|----------------------|:------------:|--------------------------------------------------------|
| `DATABASE_URL`       | да           | PostgreSQL async DSN для FastAPI                       |
| `DATABASE_URL_WORKER`| да           | PostgreSQL DSN для Celery (роль `medvychet_worker`)    |
| `REDIS_URL`          | да           | Redis DSN (`redis://redis:6379/0`)                     |
| `JWT_SECRET_KEY`     | да           | Секрет для подписи JWT (min 32 байта hex)              |
| `ENCRYPTION_KEY`     | да           | AES-256 ключ для шифрования ПД (base64, 32 байта)      |
| `FRONTEND_URL`       | да           | Origin фронтенда для CORS                              |
| `YOS_ACCESS_KEY`     | да           | Yandex Object Storage Access Key                       |
| `YOS_SECRET_KEY`     | да           | Yandex Object Storage Secret Key                       |
| `YOS_ENDPOINT`       | да           | `https://storage.yandexcloud.net`                      |
| `YOS_REGION`         | да           | `ru-central1`                                          |
| `YOS_BUCKET_RECEIPTS`| да           | Имя бакета для чеков                                   |
| `YOS_BUCKET_PRESCRIPTIONS` | да    | Имя бакета для рецептов                                |
| `YOS_BUCKET_EXPORTS` | да           | Имя бакета для экспортов                               |
| `TELEGRAM_BOT_TOKEN` | да           | Токен бота — используется для отправки OTP и уведомлений |
| `SENTRY_DSN`         | нет          | DSN Sentry для отслеживания ошибок                     |
| `ENVIRONMENT`        | нет          | `development` / `production` (default: `production`)   |
| `DEBUG`              | нет          | `true` / `false` (default: `false`)                    |

### Ключевые параметры безопасности

```bash
# Генерация JWT_SECRET_KEY
openssl rand -hex 32

# Генерация ENCRYPTION_KEY
openssl rand -base64 32
```

---

## Структура API

| Префикс                  | Router            | Назначение                         |
|--------------------------|-------------------|------------------------------------|
| `/api/v1/auth/*`         | auth_router       | OTP авторизация, JWT refresh        |
| `/api/v1/receipts/*`     | receipts_router   | Загрузка и управление чеками       |
| `/api/v1/prescriptions/*`| prescriptions_router | Поиск и привязка рецептов       |
| `/api/v1/batch/*`        | batch_router      | Batch OCR, SSE-поток прогресса     |
| `/api/v1/export/*`       | export_router     | Генерация PDF/ZIP для ИФНС         |
| `/api/v1/health`         | —                 | Healthcheck (DB + Redis)           |
| `/docs`                  | —                 | Swagger UI (только в dev)          |
| `/redoc`                 | —                 | ReDoc (только в dev)               |

---

## Запуск

### В Docker Compose (production)

```bash
docker compose -f infra/docker-compose.yml up -d backend
```

### Локальная разработка

```bash
cd backend
uv sync
uvicorn app.main:app --reload --port 8000
```

### Пересборка контейнера

```bash
docker compose -f infra/docker-compose.yml build backend
docker compose -f infra/docker-compose.yml up -d --no-deps backend
```

---

## Миграции базы данных

```bash
# Применить все миграции
docker compose -f infra/docker-compose.yml exec backend alembic upgrade head

# Создать новую миграцию
docker compose -f infra/docker-compose.yml exec backend \
  alembic revision --autogenerate -m "описание_изменения"

# Откатить последнюю миграцию
docker compose -f infra/docker-compose.yml exec backend alembic downgrade -1

# Посмотреть историю миграций
docker compose -f infra/docker-compose.yml exec backend alembic history
```

---

## Дебаг модуля

### Просмотр логов

```bash
# Все логи контейнера
docker compose -f infra/docker-compose.yml logs -f backend

# Последние 100 строк
docker compose -f infra/docker-compose.yml logs --tail=100 backend
```

### Healthcheck

```bash
# Проверить статус API и подключений к БД и Redis
curl http://localhost:8000/api/v1/health
# Ожидаемый ответ: {"status":"ok","db":"ok","redis":"ok"}
```

### Войти в контейнер

```bash
docker compose -f infra/docker-compose.yml exec backend bash
```

### Проверить конфигурацию

```bash
docker compose -f infra/docker-compose.yml exec backend \
  python -c "from app.config import settings; print(settings.model_dump())"
```

### Проверить подключение к PostgreSQL

```bash
docker compose -f infra/docker-compose.yml exec backend \
  python -c "
import asyncio
from sqlalchemy import text
from app.dependencies import AsyncSessionFactory

async def check():
    async with AsyncSessionFactory() as s:
        r = await s.execute(text('SELECT version()'))
        print(r.scalar())

asyncio.run(check())
"
```

### Проверить подключение к Redis

```bash
docker compose -f infra/docker-compose.yml exec backend \
  python -c "
import asyncio
import redis.asyncio as redis
from app.config import settings

async def check():
    r = redis.from_url(settings.redis_url)
    print(await r.ping())

asyncio.run(check())
"
```

### Проверить подключение к S3

```bash
docker compose -f infra/docker-compose.yml exec backend \
  python -c "
import asyncio
from app.services.storage.s3_client import S3Client

async def check():
    client = S3Client()
    # Попытка получить список объектов
    print('S3 OK')

asyncio.run(check())
"
```

### Типичные ошибки и решения

| Ошибка                                      | Причина                              | Решение                                         |
|---------------------------------------------|--------------------------------------|-------------------------------------------------|
| `Connection refused` к postgres             | Postgres ещё не запустился           | Подождать healthcheck или `docker compose restart postgres` |
| `JWT decode error`                          | Неверный `JWT_SECRET_KEY`            | Проверить переменную в `.env`                   |
| `NoSuchBucket` от S3                        | Бакет не создан в YOS                | Создать бакет в Yandex Cloud Console            |
| `Access Denied` от S3                       | Сервисный аккаунт не имеет прав      | Назначить роль `storage.editor` в Yandex Cloud  |
| `CORS error` в браузере                     | Неверный `FRONTEND_URL`              | Проверить совпадение origin в `.env`            |
| `alembic: Target database is not up to date`| Нужно применить миграции             | `alembic upgrade head`                          |
| 500 с `EncryptedString` ошибкой             | Неверный или отсутствующий `ENCRYPTION_KEY` | Сгенерировать ключ и перезапустить         |
| `POST /api/auth/otp` 404                    | Фронтенд использует неправильный URL | Фронтенд должен вызывать `/api/v1/auth/otp`     |
| OTP не приходит в Telegram                  | `TELEGRAM_BOT_TOKEN` не задан или неверный | Проверить переменную в `.env`              |
| "Пользователь не найден" при правильном номере | Разный формат при регистрации и логине | `_normalize_phone` убирает пробелы/скобки автоматически |

### Интерактивная отладка с breakpoint

В `docker-compose.yml` добавить в сервис `backend`:
```yaml
stdin_open: true
tty: true
```

В коде добавить `breakpoint()`, затем подключиться:
```bash
docker attach $(docker compose -f infra/docker-compose.yml ps -q backend)
```

### Swagger UI

В режиме `DEBUG=true` доступен: `http://localhost:8000/docs`

---

## Метрики и мониторинг

- **Sentry**: автоматически отправляет необработанные исключения и slow traces
- **Healthcheck**: `GET /api/v1/health` — используется Docker для health-проверок
- **Prometheus**: если настроен, экспортирует метрики на `/metrics`

Настройка Sentry:
```env
SENTRY_DSN=https://<key>@sentry.io/<project_id>
ENVIRONMENT=production
```
