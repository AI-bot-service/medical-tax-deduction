# Telegram Bot

## Описание

Telegram-бот для загрузки чеков и управления налоговым вычетом. Реализован на python-telegram-bot 21. Поддерживает два режима работы: polling (разработка) и webhook (production). Аутентификация через OTP + JWT, который хранится в Redis.

**Контейнер Docker Compose:** `bot`

---

## Настройки модуля

| Переменная              | Обязательная | Описание                                              |
|-------------------------|:------------:|-------------------------------------------------------|
| `TELEGRAM_BOT_TOKEN`    | да           | Токен бота от @BotFather                              |
| `TELEGRAM_WEBHOOK_SECRET` | нет        | Секрет для верификации webhook-запросов от Telegram   |
| `BACKEND_URL`           | да           | URL backend API (`http://backend:8000` внутри Docker) |
| `WEBHOOK_URL`           | нет          | Публичный HTTPS URL для webhook-режима                |
| `REDIS_URL`             | да           | Redis DSN для хранения JWT-токенов                    |

### Режим запуска

**Polling** (разработка): если `WEBHOOK_URL` не задан, бот автоматически запускается в polling-режиме.

**Webhook** (production): задать `WEBHOOK_URL`:
```env
WEBHOOK_URL=https://medvychet.systemtool.online
```

Telegram будет слать обновления на `https://medvychet.systemtool.online/<BOT_TOKEN>`.

### Получение токена бота

1. Написать [@BotFather](https://t.me/BotFather) в Telegram
2. `/newbot` → задать имя и username
3. Скопировать токен → `TELEGRAM_BOT_TOKEN`
4. `/setdomain` → указать домен для Mini App (если нужен)

---

## Обработчики (FSM)

| Handler                   | Файл                          | Назначение                                   |
|---------------------------|-------------------------------|----------------------------------------------|
| `build_otp_auth_handler`  | `handlers/conversations.py`   | FSM авторизации по OTP (телефон → код → JWT) |
| `build_receipt_flow_handlers` | `handlers/receipt_flow.py` | FSM загрузки чека (фото → обработка → ревью) |
| `build_command_handlers`  | `handlers/commands.py`        | Команды: `/help`, `/summary`, `/export`      |
| `error_handler`           | `handlers/errors.py`          | Глобальный обработчик ошибок                 |

### Хранение JWT в Redis

Бот хранит JWT-токены пользователей в Redis с ключом вида `bot:jwt:{telegram_id}` (TTL 31 день). При перезапуске бота токены восстанавливаются из Redis — пользователям не нужно повторно авторизовываться.

Реализовано в `bot/services/token_storage.py`:
- `save_tokens(telegram_id, access_token, refresh_token)` — сохранить после успешной авторизации
- `load_tokens(telegram_id)` → `tuple[str, str] | None` — загрузить при старте бота
- `delete_tokens(telegram_id)` — удалить при выходе

### Зависимости

Бот использует `python-telegram-bot[job-queue]` — дополнительный extra для поддержки `JobQueue` (APScheduler). Без него буферизация медиагрупп не работает. Убедиться что в `bot/pyproject.toml`:
```toml
"python-telegram-bot[job-queue]>=21.6"
```

---

## Запуск

### В Docker Compose

```bash
docker compose -f infra/docker-compose.yml up -d bot
```

### Локальная разработка (polling)

```bash
cd bot
uv sync
python main.py
```

### Установка webhook вручную

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://medvychet.systemtool.online/<TOKEN>" \
  -d "secret_token=<WEBHOOK_SECRET>"
```

### Проверка текущего webhook

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

### Удаление webhook (переключение в polling)

```bash
curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
```

---

## Дебаг модуля

### Просмотр логов

```bash
# Следить за логами
docker compose -f infra/docker-compose.yml logs -f bot

# Последние 100 строк
docker compose -f infra/docker-compose.yml logs --tail=100 bot
```

### Войти в контейнер

```bash
docker compose -f infra/docker-compose.yml exec bot bash
```

### Проверить подключение бота к backend

```bash
docker compose -f infra/docker-compose.yml exec bot \
  python -c "
import httpx
r = httpx.get('http://backend:8000/api/v1/health')
print(r.json())
"
```

### Проверить сохранённые JWT в Redis

```bash
docker compose -f infra/docker-compose.yml exec redis \
  redis-cli keys "bot:jwt:*"

# Просмотреть конкретный токен
docker compose -f infra/docker-compose.yml exec redis \
  redis-cli get "bot:jwt:<telegram_user_id>"
```

### Проверить состояние webhook

```bash
curl "https://api.telegram.org/bot$(grep TELEGRAM_BOT_TOKEN .env | cut -d= -f2)/getWebhookInfo" \
  | python -m json.tool
```

Ключевые поля:
- `url` — установленный webhook URL
- `pending_update_count` — необработанные обновления (должно быть ~0)
- `last_error_message` — последняя ошибка от Telegram

### Типичные ошибки и решения

| Ошибка                                          | Причина                                       | Решение                                               |
|-------------------------------------------------|-----------------------------------------------|-------------------------------------------------------|
| `Unauthorized` от Telegram API                  | Неверный `TELEGRAM_BOT_TOKEN`                 | Проверить токен через `getMe` API                     |
| `Connection refused http://backend:8000`        | Backend недоступен                            | `docker compose up -d backend`                        |
| Бот не отвечает (polling)                       | Конфликт двух экземпляров polling             | Убедиться что запущен только один процесс             |
| Бот не получает обновления (webhook)            | Webhook не установлен или SSL не работает     | `setWebhook` и проверить `getWebhookInfo`             |
| `JWT expired` при каждом действии               | Redis не хранит токены или TTL истёк          | Проверить `REDIS_URL` и наличие ключей `bot:jwt:*`    |
| `PTBUserWarning: No JobQueue`                   | Установлен пакет без extra `[job-queue]`      | Переустановить: `pip install python-telegram-bot[job-queue]` |
| Файлы не буферизуются в медиагруппу             | JobQueue не инициализирован                   | Убедиться что extra `[job-queue]` установлен          |
| `HMAC verification failed` для Mini App         | Неверная верификация `initData`               | Проверить что `TELEGRAM_BOT_TOKEN` актуален           |
| Пользователь завис в FSM-состоянии              | Исключение в обработчике не сбросило состояние| Пользователь должен написать `/start` или сброс через Redis |

### Сброс FSM-состояния пользователя

Если пользователь завис в диалоге:
```bash
# Через redis-cli (найти ключи состояния PTB)
docker compose -f infra/docker-compose.yml exec redis \
  redis-cli keys "ptb:*"
```

Или пользователь отправляет `/start` — это сбрасывает conversation handler.

### Отладка API-клиента бота

```bash
docker compose -f infra/docker-compose.yml exec bot python
```

```python
import asyncio
from services.api_client import APIClient

async def test():
    client = APIClient()
    # Тест с реальным JWT из Redis
    response = await client.get_summary(user_id=123456789)
    print(response)

asyncio.run(test())
```

---

## Метрики и мониторинг

- **Логи контейнера**: все события бота логируются с временной меткой
- **Sentry**: если `SENTRY_DSN` задан, ошибки обработчиков отправляются автоматически
- **getWebhookInfo**: для проверки здоровья webhook в production
