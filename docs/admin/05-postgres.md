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

---

### Перечисления (ENUM)

| Тип | Значения | Описание |
|-----|----------|----------|
| `ocrstatus` | `PENDING`, `DONE`, `REVIEW`, `FAILED` | Статус обработки OCR |
| `doctype` | `recipe_107`, `recipe_egisz`, `doc_025`, `doc_003`, `doc_043`, `doc_111`, `doc_025_1` | Тип медицинского документа |
| `risklevel` | `STANDARD`, `DISPUTED`, `HIGH` | Уровень риска рецепта |
| `batchstatus` | `processing`, `completed`, `partial` | Статус batch-задачи |
| `batchsource` | `telegram_bot`, `web`, `mini_app` | Источник загрузки |

---

### Таблицы

#### `users`

Пользователи. Персональные данные зашифрованы (Fernet / AES-256).

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | UUID | PK, default uuid4 | |
| `telegram_id` | BIGINT | NOT NULL, UNIQUE | Telegram user ID |
| `phone_hash` | VARCHAR(72) | NULL | SHA-256 хэш номера телефона |
| `telegram_username` | VARCHAR | NULL | @username в Telegram |
| `full_name` | VARCHAR(512) | NULL | ФИО — зашифровано |
| `inn` | VARCHAR(512) | NULL | ИНН — зашифровано |
| `snils` | VARCHAR(512) | NULL | СНИЛС — зашифровано |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |

Индексы: `ix_users_telegram_id` (unique).

RLS не включён (таблица доступна только через backend-роль).

---

#### `receipts`

Чеки пользователей. Изображение хранится в S3, ссылка в `s3_key`.

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | UUID | PK, default uuid4 | |
| `user_id` | UUID | NOT NULL, FK→users.id CASCADE | |
| `s3_key` | VARCHAR | NOT NULL | Путь к изображению в S3 |
| `ocr_status` | ocrstatus | NOT NULL, default PENDING | Статус OCR |
| `needs_prescription` | BOOLEAN | NOT NULL, default false | Есть ли Rx-позиции |
| `purchase_date` | DATE | NULL | Дата покупки |
| `pharmacy_name` | VARCHAR | NULL | Название аптеки (из OCR) |
| `total_amount` | NUMERIC(10,2) | NULL | Итого, руб. |
| `ocr_confidence` | FLOAT | NULL | Уверенность OCR (0–1) |
| `merge_strategy` | VARCHAR | NULL | Стратегия мерджа OCR |
| `fiscal_fn` | VARCHAR(20) | NULL | Номер ФН (фискальный) |
| `fiscal_fd` | VARCHAR(20) | NULL | Номер ФД |
| `fiscal_fp` | VARCHAR(20) | NULL | Фискальный признак ФП |
| `duplicate_of_id` | UUID | NULL, FK→receipts.id SET NULL | Ссылка на оригинал при дубле |
| `batch_id` | UUID | NULL, FK→batch_jobs.id SET NULL | Родительский batch |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |

Индексы:
- `ix_receipts_user_id` (user_id)
- `ix_receipts_purchase_date` (user_id, purchase_date DESC)
- `ix_receipts_batch_id` (batch_id)
- `ix_receipts_user_status` (user_id, ocr_status, created_at)
- `ix_receipts_needs_prescription` — partial index `WHERE needs_prescription = true`

Уникальные ограничения: `uq_receipts_fiscal` (fiscal_fn, fiscal_fd) — допускает NULL.

RLS включён: фильтрует по `user_id = current_setting('app.current_user_id')::uuid`.

---

#### `receipt_items`

Позиции чека (препараты).

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | UUID | PK, default uuid4 | |
| `receipt_id` | UUID | NOT NULL, FK→receipts.id CASCADE | |
| `drug_name` | VARCHAR | NOT NULL | Название препарата |
| `drug_inn` | VARCHAR | NULL | МНН (международное непатентованное название) |
| `quantity` | FLOAT | NOT NULL | Количество |
| `unit_price` | NUMERIC(10,2) | NOT NULL | Цена за единицу |
| `total_price` | NUMERIC(10,2) | NOT NULL | Сумма по позиции |
| `is_rx` | BOOLEAN | NOT NULL, default false | Рецептурный препарат |
| `prescription_id` | UUID | NULL, FK→prescriptions.id SET NULL | Привязанный рецепт |

Индексы:
- `ix_receipt_items_receipt_id` (receipt_id)
- `ix_receipt_items_drug` (drug_inn, is_rx)

RLS включён: фильтрует через `receipts.user_id`.

---

#### `prescriptions`

Рецепты и медицинские документы пользователей.

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | UUID | PK, default uuid4 | |
| `user_id` | UUID | NOT NULL, FK→users.id CASCADE | |
| `doc_type` | doctype | NOT NULL | Тип документа |
| `doctor_name` | VARCHAR | NOT NULL | Имя врача |
| `doctor_specialty` | VARCHAR | NULL | Специальность врача |
| `clinic_name` | VARCHAR | NULL | Название клиники |
| `issue_date` | DATE | NOT NULL | Дата выписки |
| `expires_at` | DATE | NOT NULL | Дата истечения |
| `drug_name` | VARCHAR | NOT NULL | Препарат в рецепте |
| `drug_inn` | VARCHAR | NULL | МНН |
| `dosage` | VARCHAR | NULL | Дозировка |
| `s3_key` | VARCHAR | NULL | Путь к скану в S3 |
| `risk_level` | risklevel | NOT NULL, default STANDARD | Уровень риска |
| `status` | VARCHAR | NOT NULL, default active | Статус рецепта |
| `batch_id` | UUID | NULL, FK→batch_jobs.id SET NULL | |
| `duplicate_of_id` | UUID | NULL, FK→prescriptions.id SET NULL | Дубликат |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |

Индексы:
- `ix_prescriptions_user_id` (user_id)
- `ix_prescriptions_drug_inn` (drug_inn)
- `ix_prescriptions_search` (user_id, drug_inn, issue_date, expires_at)
- `ix_prescriptions_drug_name_gin` (drug_name) — GIN тригрэм (расширение `pg_trgm`), нечёткий поиск
- `ix_prescriptions_batch_id` (batch_id)
- `ix_prescriptions_user_status` (user_id, status)

RLS включён: фильтрует по `user_id`.

---

#### `batch_jobs`

Задачи пакетной обработки (несколько файлов за раз).

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | UUID | PK, default uuid4 | |
| `user_id` | UUID | NOT NULL, FK→users.id CASCADE | |
| `status` | batchstatus | NOT NULL, default processing | |
| `total_files` | SMALLINT | NOT NULL, default 0 | Всего файлов |
| `done_count` | SMALLINT | NOT NULL, default 0 | Обработано успешно |
| `review_count` | SMALLINT | NOT NULL, default 0 | Требуют ручной проверки |
| `failed_count` | SMALLINT | NOT NULL, default 0 | Ошибок |
| `source` | batchsource | NOT NULL | Источник загрузки |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |
| `completed_at` | TIMESTAMPTZ | NULL | Время завершения |

Индексы: `ix_batch_jobs_user_id` (user_id).

RLS включён: фильтрует по `user_id`.

---

#### `otp_codes`

Одноразовые коды для авторизации по телефону.

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | UUID | PK, default uuid4 | |
| `phone_hash` | VARCHAR(72) | NOT NULL | SHA-256 хэш телефона |
| `code_hash` | VARCHAR(72) | NOT NULL | SHA-256 хэш OTP-кода |
| `expires_at` | TIMESTAMPTZ | NOT NULL | Срок действия |
| `attempts` | SMALLINT | NOT NULL, default 0 | Число неверных попыток |
| `used` | BOOLEAN | NOT NULL, default false | Использован |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |

Индексы:
- `ix_otp_codes_phone_hash` (phone_hash)
- `ix_otp_codes_expires_at` (expires_at)

RLS не включён.

---

#### `export_jobs`

Задачи формирования документов для налогового вычета (форма H-01).

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|----------|
| `id` | UUID | PK, default uuid4 | |
| `user_id` | UUID | NOT NULL, FK→users.id CASCADE | |
| `year` | INTEGER | NOT NULL | Налоговый год |
| `status` | VARCHAR(16) | NOT NULL, default pending | `pending` / `done` / `failed` |
| `s3_key` | VARCHAR | NULL | Путь к ZIP-архиву в S3 |
| `error` | VARCHAR | NULL | Сообщение об ошибке |
| `completed_at` | TIMESTAMPTZ | NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |

Индексы: `ix_export_jobs_user_id` (user_id).

RLS не включён.

---

### Диаграмма связей

```
users
 ├── receipts (1:N, cascade delete)
 │    └── receipt_items (1:N, cascade delete)
 │         └── prescriptions (N:1, SET NULL при удалении рецепта)
 ├── prescriptions (1:N, cascade delete)
 ├── batch_jobs (1:N, cascade delete)
 │    ├── receipts.batch_id (N:1, SET NULL)
 │    └── prescriptions.batch_id (N:1, SET NULL)
 └── export_jobs (1:N, cascade delete)

receipts.duplicate_of_id → receipts.id (самоссылка, дубликаты)
prescriptions.duplicate_of_id → prescriptions.id (самоссылка, дубликаты)
```

---

### Расширения PostgreSQL

| Расширение | Используется для |
|------------|-----------------|
| `pg_trgm` | GIN-индекс по `prescriptions.drug_name` для нечёткого поиска |

---

### Шифрование

Столбцы `users.full_name`, `users.inn`, `users.snils` хранятся зашифрованными через кастомный SQLAlchemy-тип `EncryptedString` (Fernet / AES-256). Ключ задаётся в переменной окружения `ENCRYPTION_KEY`.

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
