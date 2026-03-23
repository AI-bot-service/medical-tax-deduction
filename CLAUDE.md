# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MedВычет** — SaaS-платформа автоматизации налогового вычета на лекарства (ст. 219 НК РФ). Пользователи фотографируют чеки из аптек, система распознаёт их через OCR/QR, привязывает рецепты и генерирует пакет документов для подачи в ИФНС.

**Статус**: проект в стадии разработки. Задачи в `proekt/tasks.json`, лог в `proekt/progress.md`.

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

## Структура monorepo

```
medical-tax-deduction/
├── backend/          # FastAPI + Celery
│   ├── alembic/      # Миграции БД (0001..0005)
│   ├── app/
│   │   ├── middleware/rls.py          # SET LOCAL app.current_user_id
│   │   ├── models/                    # SQLAlchemy ORM
│   │   ├── schemas/                   # Pydantic v2 I/O
│   │   ├── routers/                   # Thin controllers
│   │   ├── services/
│   │   │   ├── ocr/                   # pipeline, qr_scanner, result_merger, drug_normalizer...
│   │   │   ├── auth/                  # otp_service, jwt_service, mini_app_service
│   │   │   ├── prescriptions/         # search_service (L1-L4), pdf_blank
│   │   │   ├── export/                # pdf_registry, zip_packager, cover_letter
│   │   │   └── storage/               # s3_client, encryption
│   │   └── repositories/              # SQLAlchemy async data access
│   ├── workers/
│   │   ├── celery_app.py
│   │   ├── tasks/                     # ocr_task, batch_task, cleanup_task
│   │   └── sse_publisher.py           # Redis PubSub publish
│   └── data/grls_drugs.json           # Реестр ГРЛС (МНН + is_rx)
├── bot/              # python-telegram-bot 21 [job-queue]
│   ├── handlers/conversations.py      # FSM: RECEIPT_FLOW, MANUAL_PRESCRIPTION_INPUT, OTP_AUTH
│   ├── handlers/receipt_flow.py       # Буферизация медиагрупп (3 сек), POST /api/v1/batch
│   ├── services/api_client.py         # httpx клиент к backend с cookie JWT
│   └── services/token_storage.py     # Redis-хранение JWT токенов (TTL 31 день)
├── frontend/         # Next.js 15
│   └── src/
│       ├── app/(cabinet)/             # Защищённые страницы ЛК
│       ├── lib/api.ts                 # Fetch wrapper (401→refresh→retry)
│       ├── lib/store.ts               # Zustand: authStore, batchStore, reviewStore
│       └── lib/sse.ts                 # SSE-клиент для batch stream
├── infra/
│   ├── docker-compose.yml
│   ├── nginx/nginx.conf
│   └── nginx/medvychet.systemtool.online.conf  # production host nginx
├── .github/workflows/deploy.yml               # CI/CD: git pull + docker compose build + up
└── proekt/
    ├── PRD.md                         # Полный PRD v2.0
    ├── tasks.json                     # Список задач для агентов
    └── progress.md                    # Лог прогресса
```

## Backend — HTTP-маршруты (`/api/v1`)

### Auth (`/api/v1/auth`)

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/auth/otp` | Отправить OTP-код в Telegram пользователя |
| `POST` | `/auth/verify` | Верифицировать OTP, выдать JWT cookies |
| `POST` | `/auth/refresh` | Ротация refresh-token (family invalidation) |
| `POST` | `/auth/logout` | Очистить auth cookies |
| `POST` | `/auth/bot-register` | Регистрация/поиск пользователя из бота, JWT в body |
| `POST` | `/auth/mini-app` | Авторизация через Telegram Mini App (HMAC-SHA256) |

### Receipts (`/api/v1/receipts`)

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/receipts/upload` | Загрузить чек в S3, создать Receipt, поставить в очередь OCR |
| `GET` | `/receipts/summary` | Годовая статистика: расходы по месяцам, вычет 13%, процент лимита |
| `GET` | `/receipts` | Список чеков с группировкой по месяцам (фильтры: year, month) |
| `GET` | `/receipts/{id}` | Детали чека: позиции, presigned URL изображения |
| `PATCH` | `/receipts/{id}` | Частичное обновление (дата, аптека, сумма, позиции) |

### Batch (`/api/v1/batch`)

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/batch` | Загрузить N файлов, создать BatchJob, поставить в очередь |
| `GET` | `/batch/{id}` | Статус batch job (счётчики done/review/failed) |
| `GET` | `/batch/{id}/stream` | SSE-поток real-time прогресса (heartbeat 15 сек) |

### Prescriptions (`/api/v1/prescriptions`)

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/prescriptions` | Создать рецепт (тип, врач, клиника, препарат) |
| `POST` | `/prescriptions/{id}/photo` | Загрузить фото рецепта в S3 |
| `GET` | `/prescriptions/{id}/pdf-blank` | Получить/сгенерировать PDF бланк 107-1/у |
| `GET` | `/prescriptions` | Список рецептов (фильтры: doc_type, статус) |
| `GET` | `/prescriptions/{id}` | Детали рецепта |
| `DELETE` | `/prescriptions/{id}` | Soft-delete (статус → deleted) |
| `POST` | `/prescriptions/link` | Связать рецепт с позицией чека |

### Export (`/api/v1/export`)

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/export?year=<int>` | Инициировать экспорт ZIP (реестр + письмо + чеки) для года |
| `GET` | `/export/{id}` | Статус ExportJob + presigned URL для скачивания ZIP |

### Health

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/health` | Статус сервиса (DB, Redis) |

---

## Backend — Структура `app/`

```
backend/app/
├── main.py                         # FastAPI app factory, регистрация роутеров
├── config.py                       # Settings (Pydantic BaseSettings)
├── dependencies.py                 # DI: get_session, get_current_user, get_redis
├── middleware/
│   └── rls.py                     # SET LOCAL app.current_user_id = :uid
├── models/                         # SQLAlchemy ORM (UUID pk, created_at, updated_at)
│   ├── user.py                    # telegram_id, phone_hash, telegram_username
│   ├── receipt.py                 # s3_key, ocr_status, purchase_date, pharmacy_name,
│   │                              #   total_amount, ocr_confidence, merge_strategy,
│   │                              #   needs_prescription, batch_id
│   ├── receipt_item.py            # drug_name, drug_inn, quantity, unit_price,
│   │                              #   total_price, is_rx, prescription_id
│   ├── prescription.py            # doc_type, doctor_name, clinic_name, issue_date,
│   │                              #   expires_at, drug_inn, risk_level, status, s3_key
│   ├── batch_job.py               # status, total_files, done/review/failed counts, source
│   ├── export_job.py              # year, status, s3_key, error
│   ├── otp_code.py                # phone_hash, code, expires_at, used
│   └── enums.py                   # OCRStatus, BatchStatus, DocType, RiskLevel, ExportStatus
├── schemas/                        # Pydantic v2 request/response
│   ├── auth.py                    # OTPRequest, VerifyRequest, MiniAppAuthRequest…
│   ├── receipt.py                 # ReceiptUploadResponse, ReceiptDetail, Summary…
│   ├── batch.py                   # BatchJobResponse, BatchJobDetail
│   ├── prescription.py            # PrescriptionCreate, PrescriptionResponse…
│   └── export.py                  # ExportCreateResponse, ExportStatusResponse
├── routers/                        # Thin controllers (валидация → сервис → ответ)
│   ├── auth.py
│   ├── receipts.py
│   ├── batch.py
│   ├── prescriptions.py
│   └── export.py
├── services/
│   ├── auth/
│   │   ├── jwt_service.py         # create/decode access (15 мин) + refresh (30 дн),
│   │   │                          #   family_id для ротации
│   │   ├── otp_service.py         # generate_otp, verify_otp (6 цифр, TTL 5 мин)
│   │   └── mini_app_service.py    # HMAC-SHA256 верификация Telegram initData
│   ├── ocr/
│   │   ├── pipeline.py            # Оркестратор: QR ‖ EasyOCR → merge → normalize
│   │   ├── qr_scanner.py          # pyzbar + OpenCV, 5 стратегий декодирования
│   │   ├── easyocr_engine.py      # таймаут 120 сек, fallback на Tesseract < 5 блоков
│   │   ├── tesseract_engine.py    # fallback OCR
│   │   ├── image_preprocessor.py  # поворот, деноизирование
│   │   ├── batch_classifier.py    # receipt / prescription / unknown
│   │   ├── result_merger.py       # 6 стратегий: merged / fns_only / ocr_only / conflict…
│   │   ├── drug_normalizer.py     # rapidfuzz против GRLS JSON, is_rx
│   │   └── ocr_result.py          # OCRResult, QRResult, ParsedItem dataclasses
│   ├── prescriptions/
│   │   ├── search_service.py      # 4-уровневый поиск (L1 exact INN → L4 нет)
│   │   └── pdf_blank.py           # ReportLab PDF бланк 107-1/у
│   ├── export/
│   │   ├── pdf_registry.py        # ReportLab A4 реестр чеков (8 колонок, итоги)
│   │   ├── cover_letter.py        # WeasyPrint письмо в ИФНС
│   │   └── zip_packager.py        # build_zip + upload в S3
│   └── storage/
│       ├── s3_client.py           # boto3 wrapper YOS (SSE-S3, presigned TTL 15 мин)
│       └── encryption.py          # AES-256 EncryptedString (ФИО, ИНН, СНИЛС)
└── repositories/                   # SQLAlchemy async CRUD

backend/workers/
├── celery_app.py                   # broker=Redis, beat_schedule (cleanup каждые 15 мин)
├── sse_publisher.py                # Redis PubSub publish в канал batch:{id}
└── tasks/
    ├── ocr_task.py                 # process_receipt(receipt_id)
    │                               #   → S3 download → OCR pipeline → save → notify TG
    │                               #   retry: 3×, countdown 60 сек
    ├── batch_task.py               # process_batch_file(batch_id, file_index, s3_key, user_id)
    │                               #   → classify → OCR/save → update counters → SSE publish
    │                               #   → если все файлы done: batch COMPLETED + TG notify
    │                               #   retry: 2×, countdown 30 сек
    ├── export_task.py              # generate_export(export_job_id, user_id, year)
    │                               #   → собрать чеки → PDF реестр → письмо → ZIP → S3
    │                               #   retry: 2×, countdown 60 сек
    └── cleanup_task.py             # cleanup_expired_otps() — Celery Beat, каждые 15 мин
```

---

## Команды разработки

```bash
# Запуск всего стека
docker compose up --build

# Backend разработка
cd backend && uv sync
uvicorn app.main:app --reload --port 8000
celery -A workers.celery_app worker --loglevel=info

# Bot разработка
cd bot && uv sync
python main.py   # polling режим при отсутствии WEBHOOK_URL

# Frontend разработка
cd frontend && npm install
npm run dev      # localhost:3000

# Миграции БД
cd backend && alembic upgrade head
alembic revision --autogenerate -m "description"

# Тесты
cd backend && pytest
cd backend && pytest tests/test_ocr/  # один модуль

# Линтинг
cd backend && ruff check . && mypy .
cd frontend && npm run lint && npm run tsc
```

## Ключевые архитектурные решения

### OCR-пайплайн (критический путь)

`pipeline.py` запускает параллельно:

1. **QR decode** (sync, < 0.5 сек) через `qr_scanner.py` — pyzbar + OpenCV, 5 стратегий
2. **EasyOCR** (thread) через `easyocr_engine.py` — fallback на Tesseract если < 5 блоков
3. **ReceiptAgeEstimator** — если дата чека > 12 мес, QR пропускается
4. **ResultMerger** — 6 стратегий слияния: `merged/merged_date_conflict/fns_only/ocr_only/conflict/both_failed`
5. **DrugNormalizer** — rapidfuzz против GRLS JSON, определяет `is_rx`

Confidence threshold: ≥0.85 → DONE, 0.20–0.84 → REVIEW, <0.20 → FAILED

**EasyOCR таймаут**: 120 сек (CPU без GPU занимает 30–90 сек). Настраивается в `easyocr_engine.py` через `_EASYOCR_TIMEOUT_SEC`.

**Классификатор** (`batch_classifier.py`): перед OCR-пайплайном определяет тип документа (receipt/prescription). Fallback (шаг 5): если Tesseract не распознаёт текст → файл всё равно идёт в OCR как receipt с confidence=0.50, а не сразу в FAILED.

### Безопасность и 152-ФЗ

- **RLS**: каждый запрос → `SET LOCAL app.current_user_id = :uid` через `middleware/rls.py`. Celery-воркеры используют роль `medvychet_worker` с `BYPASS RLS`
- **S3**: только pre-signed URL с TTL 15 мин, прямых публичных ссылок нет
- **JWT**: httpOnly cookie, access TTL 15 мин, refresh TTL 30 дней с rotation (family invalidation)
- **ПД**: номер телефона → SHA-256 hash (нормализуется перед хешированием: `+7 (912) 481-57-60` = `+79124815760`); ФИО/ИНН/СНИЛС → AES-256 через `EncryptedString` TypeDecorator
- Все данные только в РФ (YOS ЦОД)

### SSE (real-time прогресс batch)

Celery → `sse_publisher.py` публикует в Redis PubSub канал `batch:{id}` → FastAPI `StreamingResponse` читает и отдаёт клиенту. Heartbeat каждые 15 сек. Frontend: `useBatchSSE` hook → `batchStore`.

По завершении batch `batch_task.py` отправляет Telegram-уведомление пользователю через Bot API (требует `TELEGRAM_BOT_TOKEN` в env backend).

### Авторизация через личный кабинет

Фронтенд вызывает `/api/v1/auth/otp` и `/api/v1/auth/verify` напрямую (nginx проксирует в backend). OTP-код отправляется в Telegram пользователя. Номер телефона нормализуется перед хешированием (`_normalize_phone` в `routers/auth.py`).

### Telegram Mini App

Авторизация через `initData` — HMAC-SHA256 верификация на backend. Тема подхватывается из Telegram SDK. Файлы загружаются через нативный file picker.

## FNS Open API (будущая интеграция)

Текущая реализация использует только OCR+QR. ФНС Open API — отдельная модернизация (требует юрлица + ЭЦП).

**Когда будет реализовано**: `step1_fns.py` в `services/ocr/`. Аутентификация:

1. Master-token → SOAP запрос к AuthService → Temporary token
2. HTTP header `FNS-OpenApi-Token: <token>` в каждом запросе
3. Асинхронный: `SendMessage` → `MessageId` → поллинг `GetMessage` до `COMPLETED`

## Работа с задачами

Перед началом работы:

1. Прочитать `proekt/tasks.json`
2. Выбрать одну задачу `status: pending` с наивысшим приоритетом
3. Убедиться что все `dependencies` имеют `status: done`
4. После завершения: обновить `status` на `done`, добавить запись в `proekt/progress.txt`
