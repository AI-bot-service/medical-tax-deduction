# Redis

## Описание

Redis используется как брокер задач Celery, result backend и PubSub-шина для SSE. Хранит JWT refresh токены бота и OTP-коды авторизации.

**Контейнер Docker Compose:** `redis`
**Image:** `redis:7-alpine`
**Порт:** не проксируется на хост (доступен только внутри Docker-сети)

---

## Использование в проекте

| Назначение                      | Ключ / канал                          | TTL               |
|---------------------------------|---------------------------------------|-------------------|
| Celery broker queue             | `celery` (list)                       | —                 |
| Celery result backend           | `celery-task-meta-<task_id>`          | 24 часа (default) |
| SSE PubSub канал batch          | `batch:<batch_id>` (channel)          | —                 |
| JWT токены бота                 | `bot:jwt:<telegram_user_id>`          | 30 дней           |
| OTP-коды авторизации            | `otp:<phone_hash>`                    | 10 минут          |

---

## Настройки модуля

| Переменная  | Значение                  | Описание                   |
|-------------|---------------------------|----------------------------|
| `REDIS_URL` | `redis://redis:6379/0`    | DSN для всех компонентов   |

Redis запускается без пароля (только внутренняя сеть Docker). В production с публичным доступом настроить `requirepass`:

```yaml
# docker-compose.yml
redis:
  image: redis:7-alpine
  command: redis-server --requirepass <СЛОЖНЫЙ_ПАРОЛЬ>
```

Тогда `REDIS_URL=redis://:<ПАРОЛЬ>@redis:6379/0`.

---

## Запуск

### В Docker Compose

```bash
docker compose -f infra/docker-compose.yml up -d redis
```

Healthcheck встроен: ждёт `redis-cli ping` перед стартом зависимых сервисов.

---

## Дебаг модуля

### Просмотр логов

```bash
docker compose -f infra/docker-compose.yml logs -f redis
```

### Подключиться к redis-cli

```bash
docker compose -f infra/docker-compose.yml exec redis redis-cli
```

### Полезные команды redis-cli

```bash
# Общая информация о сервере
INFO

# Использование памяти
INFO memory

# Статистика клиентов
INFO clients

# Все ключи (осторожно в prod — медленно!)
KEYS *

# Ключи по паттерну
KEYS bot:jwt:*
KEYS celery-task-meta-*

# Проверить значение ключа
GET bot:jwt:123456789

# TTL ключа (-1 = вечный, -2 = не существует)
TTL bot:jwt:123456789

# Длина Celery-очереди
LLEN celery

# Просмотр первых N элементов очереди
LRANGE celery 0 4

# Число подписчиков на каналы PubSub
PUBSUB CHANNELS batch:*
PUBSUB NUMSUB batch:some-uuid

# Очистить все данные (ТОЛЬКО DEV!)
FLUSHALL

# Мониторинг команд в реальном времени
MONITOR
```

### Проверить Celery-очередь

```bash
# Количество задач в очереди
docker compose -f infra/docker-compose.yml exec redis \
  redis-cli llen celery

# Если > 100 — воркер не успевает или завис
```

### Проверить SSE PubSub

```bash
# Подписаться на канал batch и смотреть сообщения
docker compose -f infra/docker-compose.yml exec redis \
  redis-cli subscribe batch:<batch_id>
```

### Типичные ошибки и решения

| Ошибка                                                  | Причина                                         | Решение                                             |
|---------------------------------------------------------|-------------------------------------------------|-----------------------------------------------------|
| `Connection refused redis:6379`                         | Контейнер Redis не запустился                   | `docker compose up -d redis`                        |
| `NOAUTH Authentication required`                        | Redis требует пароль, но он не задан в URL      | Добавить пароль в `REDIS_URL`                       |
| `OOM command not allowed when used memory > maxmemory` | Нехватка памяти                                 | Увеличить `maxmemory` или очистить устаревшие ключи |
| Celery-задачи не выполняются, очередь растёт            | Воркер упал или не подключён к брокеру          | `docker compose restart celery_worker`              |
| SSE-поток обрывается сразу                              | PubSub канал пустой или batch завершён          | Проверить статус batch через API                    |
| `bot:jwt:*` ключи исчезают                              | TTL истёк или Redis перезагружался без persistence | Настроить Redis persistence (AOF)                 |

### Настройка Redis Persistence (рекомендуется для production)

Чтобы данные (JWT токены бота) не терялись при перезапуске:

```yaml
# docker-compose.yml
redis:
  image: redis:7-alpine
  command: redis-server --appendonly yes --appendfsync everysec
  volumes:
    - redis_data:/data
```

### Мониторинг памяти

```bash
# Текущее использование памяти
docker compose -f infra/docker-compose.yml exec redis \
  redis-cli info memory | grep used_memory_human

# Установить лимит памяти и политику вытеснения
# В команде запуска: --maxmemory 256mb --maxmemory-policy allkeys-lru
```

---

## Метрики и мониторинг

```bash
# Статистика в одну команду
docker compose -f infra/docker-compose.yml exec redis \
  redis-cli info stats | grep -E "total_commands|keyspace_hits|keyspace_misses"

# Hit ratio (должен быть > 80%)
# hits / (hits + misses)
```

Redis Exporter для Prometheus (опционально):
```yaml
redis_exporter:
  image: oliver006/redis_exporter
  environment:
    REDIS_ADDR: redis://redis:6379
  ports:
    - "127.0.0.1:9121:9121"
```
