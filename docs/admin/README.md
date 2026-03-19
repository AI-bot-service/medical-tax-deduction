# Документация администратора MedВычет

## Содержание

| Файл                                        | Описание                                          |
|---------------------------------------------|---------------------------------------------------|
| [00-overview.md](./00-overview.md)          | Обзор инфраструктуры, Yandex Cloud, первый запуск |
| [01-backend.md](./01-backend.md)            | FastAPI Backend — настройки, API, дебаг           |
| [02-celery-worker.md](./02-celery-worker.md)| Celery Worker — OCR-пайплайн, задачи, дебаг       |
| [03-frontend.md](./03-frontend.md)          | Next.js Frontend — настройки, сборка, дебаг       |
| [04-bot.md](./04-bot.md)                    | Telegram Bot — webhook/polling, FSM, дебаг        |
| [05-postgres.md](./05-postgres.md)          | PostgreSQL — RLS, миграции, бэкап, дебаг          |
| [06-redis.md](./06-redis.md)                | Redis — Celery broker, SSE PubSub, дебаг          |
| [07-nginx.md](./07-nginx.md)                | Nginx — SSL, маршрутизация, SSE, дебаг            |
| [08-yandex-cloud.md](./08-yandex-cloud.md) | Yandex Cloud — VM, Object Storage, безопасность   |

## Быстрый старт

```bash
# Запустить весь стек
docker compose -f infra/docker-compose.yml up -d --build

# Применить миграции
docker compose -f infra/docker-compose.yml exec backend alembic upgrade head

# Проверить здоровье
curl http://localhost:8000/api/v1/health
```

## Быстрая диагностика

```bash
# Статус всех контейнеров
docker compose -f infra/docker-compose.yml ps

# Логи всех сервисов
docker compose -f infra/docker-compose.yml logs -f

# Логи конкретного сервиса
docker compose -f infra/docker-compose.yml logs -f backend
docker compose -f infra/docker-compose.yml logs -f celery_worker
docker compose -f infra/docker-compose.yml logs -f bot
docker compose -f infra/docker-compose.yml logs -f frontend
docker compose -f infra/docker-compose.yml logs -f postgres
docker compose -f infra/docker-compose.yml logs -f redis
```
