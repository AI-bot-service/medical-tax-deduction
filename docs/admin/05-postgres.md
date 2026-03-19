# PostgreSQL

## Описание

Основная реляционная база данных платформы. Версия 15. Реализует Row-Level Security (RLS) для изоляции данных пользователей — каждый пользователь видит только свои записи.

**Контейнер Docker Compose:** `postgres`
**Порт:** не проксируется на хост (доступен только внутри Docker-сети)

---

## Настройки модуля

| Переменная          | Значение по умолчанию    | Описание                                        |
|---------------------|--------------------------|--------------------------------------------------|
| `POSTGRES_USER`     | `medvychet`              | Суперпользователь БД                             |
| `POSTGRES_PASSWORD` | задаётся в `.env`        | Пароль суперпользователя                         |
| `POSTGRES_DB`       | `medvychet`              | Имя БД                                           |
| `DATABASE_URL`      | —                        | DSN для FastAPI: `postgresql+asyncpg://...`      |
| `DATABASE_URL_WORKER`| —                       | DSN для Celery с ролью `medvychet_worker`        |

### Роли PostgreSQL

| Роль                | Права                              | Используется                       |
|---------------------|------------------------------------|------------------------------------|
| `medvychet`         | Суперпользователь БД               | Миграции, DDL                      |
| `medvychet_worker`  | BYPASS RLS, DML на все таблицы     | Celery-воркеры (обходят RLS)       |

> Роль `medvychet_worker` создаётся миграцией Alembic.

### RLS (Row-Level Security)

Каждый HTTP-запрос устанавливает локальный параметр сессии:
```sql
SET LOCAL app.current_user_id = '<uuid>';
```

Политики RLS на таблицах фильтруют строки по `user_id = current_setting('app.current_user_id')::uuid`.

Celery-воркеры используют роль `medvychet_worker` с `BYPASS RLS` — они видят все записи без ограничений.

---

## Структура БД (миграции Alembic)

Миграции хранятся в `backend/alembic/versions/`. Текущий HEAD:

```bash
# Посмотреть список миграций
docker compose -f infra/docker-compose.yml exec backend alembic history --verbose
```

Основные таблицы:
- `users` — пользователи (телефон bcrypt, ФИО/ИНН/СНИЛС зашифрованы)
- `receipts` — чеки пользователей (ссылки на S3)
- `prescriptions` — рецепты
- `batches` — batch-задачи OCR
- `otps` — одноразовые коды авторизации
- `refresh_tokens` — JWT refresh токены (family invalidation)
- `exports` — сгенерированные ZIP-архивы

---

## Запуск

### В Docker Compose

```bash
docker compose -f infra/docker-compose.yml up -d postgres
```

Healthcheck встроен в docker-compose: ждёт `pg_isready` перед стартом зависимых сервисов.

---

## Дебаг модуля

### Просмотр логов

```bash
docker compose -f infra/docker-compose.yml logs -f postgres
```

### Подключиться к psql

```bash
# От имени суперпользователя
docker compose -f infra/docker-compose.yml exec postgres \
  psql -U medvychet -d medvychet

# С хоста (если открыт порт)
psql postgresql://medvychet:<password>@localhost:5432/medvychet
```

### Полезные SQL-запросы

```sql
-- Список таблиц
\dt

-- Размер всех таблиц
SELECT relname, pg_size_pretty(pg_total_relation_size(oid))
FROM pg_class WHERE relkind = 'r' AND relname NOT LIKE 'pg_%'
ORDER BY pg_total_relation_size(oid) DESC;

-- Активные подключения
SELECT pid, usename, application_name, state, query_start, query
FROM pg_stat_activity WHERE datname = 'medvychet';

-- Заблокированные запросы
SELECT pid, wait_event_type, wait_event, query
FROM pg_stat_activity WHERE wait_event IS NOT NULL;

-- Убить зависший процесс
SELECT pg_terminate_backend(<pid>);

-- Проверить RLS-политики
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies WHERE schemaname = 'public';

-- Количество записей по таблицам
SELECT relname, n_live_tup
FROM pg_stat_user_tables ORDER BY n_live_tup DESC;
```

### Бэкап БД

```bash
# Создать дамп
docker compose -f infra/docker-compose.yml exec postgres \
  pg_dump -U medvychet medvychet > backup_$(date +%Y%m%d_%H%M%S).sql

# Восстановить из дампа
docker compose -f infra/docker-compose.yml exec -T postgres \
  psql -U medvychet medvychet < backup.sql

# Бэкап в сжатом формате
docker compose -f infra/docker-compose.yml exec postgres \
  pg_dump -U medvychet -Fc medvychet > backup.dump

# Восстановление из сжатого
docker compose -f infra/docker-compose.yml exec -T postgres \
  pg_restore -U medvychet -d medvychet < backup.dump
```

### Миграции

```bash
# Применить все миграции
docker compose -f infra/docker-compose.yml exec backend alembic upgrade head

# Откатить последнюю
docker compose -f infra/docker-compose.yml exec backend alembic downgrade -1

# Посмотреть текущую версию схемы
docker compose -f infra/docker-compose.yml exec backend alembic current
```

### Типичные ошибки и решения

| Ошибка                                          | Причина                                  | Решение                                                  |
|-------------------------------------------------|------------------------------------------|----------------------------------------------------------|
| `Connection refused :5432`                      | Контейнер не запустился                  | `docker compose up -d postgres` и проверить healthcheck  |
| `password authentication failed`               | Неверный пароль в `DATABASE_URL`         | Проверить `POSTGRES_PASSWORD` в `.env`                   |
| `database "medvychet" does not exist`           | БД не создана                            | Пересоздать контейнер: `docker compose down -v && up`    |
| `FATAL: remaining connection slots are reserved`| Превышен лимит соединений               | Увеличить `max_connections` или уменьшить pool size       |
| `RLS: new row violates row-level security policy`| Попытка вставки без установки user_id   | Проверить `RLSMiddleware` или использовать worker-роль   |
| Slow query                                      | Отсутствует индекс                       | `EXPLAIN ANALYZE <query>` и добавить индекс через миграцию |

### Принудительный сброс БД (только dev!)

```bash
# ВНИМАНИЕ: удалит все данные
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d postgres
docker compose -f infra/docker-compose.yml exec backend alembic upgrade head
```

---

## Метрики и мониторинг

```sql
-- Метрики PostgreSQL
SELECT * FROM pg_stat_database WHERE datname = 'medvychet';

-- Cache hit ratio (должен быть > 95%)
SELECT sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as cache_hit_ratio
FROM pg_statio_user_tables;
```

### Prometheus exporter (опционально)

Добавить `postgres_exporter` в docker-compose для сбора метрик Prometheus.

---

## Резервное копирование (production)

Настроить автоматический ежедневный бэкап на Yandex Object Storage:

```bash
#!/bin/bash
# /etc/cron.daily/backup-postgres.sh
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/medvychet_${TIMESTAMP}.sql.gz"

docker compose -f /opt/medvychet/infra/docker-compose.yml exec postgres \
  pg_dump -U medvychet medvychet | gzip > "$BACKUP_FILE"

aws s3 cp "$BACKUP_FILE" \
  s3://medvychet-exports/backups/postgres/ \
  --endpoint-url https://storage.yandexcloud.net

rm "$BACKUP_FILE"
```
