# Celery Worker (OCR + Batch)

## Описание

Celery-воркер обрабатывает тяжёлые асинхронные задачи: распознавание чеков через OCR/QR, оркестрацию batch-обработки и плановую очистку устаревших OTP. Использует тот же Docker-образ что и backend, но с другой командой запуска.

**Контейнер Docker Compose:** `celery_worker`
**Брокер/Backend:** Redis (`redis://redis:6379/0`)

---

## Задачи

| Задача                                              | Триггер        | Описание                                              |
|-----------------------------------------------------|----------------|-------------------------------------------------------|
| `workers.tasks.ocr_task.process_receipt`            | По запросу     | OCR одного чека (QR + EasyOCR + слияние + нормализация) |
| `workers.tasks.batch_task.process_batch`            | По запросу     | Оркестрация batch: запускает ocr_task для каждого чека |
| `workers.tasks.cleanup_task.cleanup_expired_otps`   | Каждые 15 мин  | Удаление просроченных OTP-кодов из БД               |

### Batch-классификатор (`batch_classifier.py`)

Перед запуском OCR-пайплайна каждый файл проходит быструю классификацию (Tesseract PSM-6 + QR):

| Шаг | Условие | Результат | Confidence |
|-----|---------|-----------|-----------|
| 1 | QR с параметром `fn=` найден | receipt | 1.0 |
| 2 | ≥ 3 ключевых слов чека (АПТЕКА, ИТОГО, ФН…) | receipt | 0.85 |
| 2b | ≥ 1 ключевое слово чека | receipt | 0.60 |
| 3 | ≥ 2 ключевых слов рецепта A (Rp., РЕЦЕПТ…) | prescription | 0.85 |
| 4 | ≥ 2 ключевых слов рецепта B (ВЫПИСКА, ДИАГНОЗ…) | prescription | 0.80 |
| 5 | Иное (Tesseract вернул мусор или нет совпадений) | receipt | 0.50 |

> **Важно:** шаг 5 по умолчанию направляет файл в OCR-пайплайн как чек с низкой уверенностью вместо немедленного отказа. Tesseract PSM-6 часто даёт нечитаемый вывод на реальных фото аптечных чеков — EasyOCR справляется лучше.

### OCR-пайплайн (критический путь)

```
process_receipt
├── QR decode (sync, pyzbar + OpenCV, 5 стратегий)
├── EasyOCR (thread, timeout 120s) → fallback на Tesseract если < 5 блоков
├── ReceiptAgeEstimator → если дата > 12 мес, QR пропускается
├── ResultMerger → стратегия слияния:
│   merged / merged_date_conflict / fns_only /
│   ocr_only / conflict / both_failed
└── DrugNormalizer → rapidfuzz vs ГРЛС JSON → is_rx

Confidence threshold:
  ≥ 0.85 → DONE
  0.20–0.84 → REVIEW (требует ручной проверки)
  < 0.20 → FAILED
```

> **Примечание:** EasyOCR без GPU работает 30–90 секунд на изображение. Таймаут установлен 120 секунд. GPU ускорит до 2–5 секунд.

### Уведомления по завершении batch

После обработки всех файлов batch-задача отправляет пользователю Telegram-сообщение через Bot API с итогами: количество распознанных, требующих проверки и нераспознанных чеков.

---

## Настройки модуля

Воркер использует те же переменные `.env`, что и backend. Ключевые:

| Переменная             | Описание                                                   |
|------------------------|------------------------------------------------------------|
| `REDIS_URL`            | Адрес брокера и result backend                             |
| `DATABASE_URL_WORKER`  | PostgreSQL с ролью `medvychet_worker` (BYPASS RLS)         |
| `YOS_ACCESS_KEY/SECRET`| S3 для чтения/записи файлов чеков                          |
| `ENCRYPTION_KEY`       | AES-256 для расшифровки ПД при работе с чеками             |

### Конфигурация Celery (`workers/celery_app.py`)

```python
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Moscow",
    enable_utc=True,
    task_track_started=True,
    beat_schedule={
        "cleanup-expired-otps": {
            "task": "workers.tasks.cleanup_task.cleanup_expired_otps",
            "schedule": crontab(minute="*/15"),
        },
    },
)
```

### Переменные, специфичные для воркера

Можно добавить в `.env` для тонкой настройки:

```env
# Количество воркеров (по умолчанию = число CPU)
CELERYD_CONCURRENCY=2

# Максимум задач на воркера до перезапуска (защита от утечек памяти)
CELERYD_MAX_TASKS_PER_CHILD=100

# Логирование
CELERYD_LOGLEVEL=INFO
```

Если нужно передать эти параметры, изменить `command` в `docker-compose.yml`:
```yaml
command: celery -A workers.celery_app worker --loglevel=info --concurrency=2 --max-tasks-per-child=100
```

---

## Запуск

### В Docker Compose

```bash
docker compose -f infra/docker-compose.yml up -d celery_worker
```

### Локальная разработка

```bash
cd backend
uv sync
celery -A workers.celery_app worker --loglevel=info
```

### С Celery Beat (периодические задачи)

По умолчанию beat встроен в воркер. При необходимости запустить отдельно:
```bash
celery -A workers.celery_app beat --loglevel=info
```

---

## Дебаг модуля

### Просмотр логов

```bash
# Следить за логами в реальном времени
docker compose -f infra/docker-compose.yml logs -f celery_worker

# Последние 200 строк
docker compose -f infra/docker-compose.yml logs --tail=200 celery_worker
```

### Войти в контейнер

```bash
docker compose -f infra/docker-compose.yml exec celery_worker bash
```

### Celery Inspect — состояние воркеров

```bash
docker compose -f infra/docker-compose.yml exec celery_worker \
  celery -A workers.celery_app inspect active

# Список зарегистрированных задач
docker compose -f infra/docker-compose.yml exec celery_worker \
  celery -A workers.celery_app inspect registered

# Статистика
docker compose -f infra/docker-compose.yml exec celery_worker \
  celery -A workers.celery_app inspect stats
```

### Flower — веб-мониторинг Celery

Запустить временно для диагностики:
```bash
docker compose -f infra/docker-compose.yml exec celery_worker \
  pip install flower && \
  celery -A workers.celery_app flower --port=5555
```

Или добавить в `docker-compose.yml`:
```yaml
flower:
  build:
    context: ../backend
    dockerfile: Dockerfile
  command: celery -A workers.celery_app flower --port=5555
  ports:
    - "127.0.0.1:5555:5555"
  env_file: ../.env
  depends_on:
    - redis
```

### Запуск задачи вручную

```bash
docker compose -f infra/docker-compose.yml exec celery_worker \
  python -c "
from workers.tasks.ocr_task import process_receipt
result = process_receipt.delay(receipt_id='<UUID>', user_id='<UUID>')
print('Task ID:', result.id)
print('Status:', result.status)
"
```

### Проверить очередь Redis

```bash
docker compose -f infra/docker-compose.yml exec redis \
  redis-cli llen celery
# Возвращает количество задач в очереди
```

### Типичные ошибки и решения

| Ошибка                                        | Причина                                     | Решение                                              |
|-----------------------------------------------|---------------------------------------------|------------------------------------------------------|
| `kombu.exceptions.OperationalError`           | Redis недоступен                            | `docker compose restart redis`                       |
| `Task received: [None]` / задача не находится | Задача не включена в `include` celery_app   | Добавить модуль задачи в список `include`            |
| Воркер зависает на OCR-задаче                 | EasyOCR потребляет всю память               | Увеличить RAM контейнера или снизить `--concurrency` |
| `EasyOCR timed out after Xs`                  | Слишком короткий таймаут для CPU            | Проверить `_EASYOCR_TIMEOUT_SEC` в `easyocr_engine.py` (должно быть 120) |
| `classified_as=unknown confidence=0.00`       | Tesseract не читает изображение             | Классификатор автоматически направит в pipeline как receipt/0.50 |
| `got Future attached to a different loop`     | Конфликт asyncio event loop в prefork       | В каждой задаче создавать `asyncio.new_event_loop()` |
| `SoftTimeLimitExceeded`                       | OCR превысил лимит времени                  | Увеличить `task_soft_time_limit` в конфигурации      |
| `DatabaseError: RLS violation`                | Задача использует неверного пользователя БД | Убедиться что используется `DATABASE_URL_WORKER`     |
| Периодические задачи не запускаются           | Beat не запущен                             | Запустить beat отдельно или добавить `--beat` флаг   |

### Отладка отдельного OCR-шага

```bash
docker compose -f infra/docker-compose.yml exec celery_worker python
```

```python
# Внутри Python-консоли
from app.services.ocr.pipeline import OCRPipeline
import asyncio

async def test():
    pipeline = OCRPipeline()
    # Путь к тестовому изображению внутри контейнера
    result = await pipeline.process("/tmp/test_receipt.jpg")
    print(result)

asyncio.run(test())
```

---

## Метрики и мониторинг

- **Celery Events**: включить в конфиге `task_send_sent_event=True` для сбора метрик
- **Flower**: веб-интерфейс мониторинга задач (см. выше)
- **Sentry**: ошибки задач автоматически отправляются если настроен `SENTRY_DSN`
- **Redis Monitor**: количество задач в очереди — `redis-cli llen celery`
