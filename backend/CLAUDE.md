# Backend CLAUDE.md

## HTTP-маршруты (`/api/v1`)

### Auth
| Метод  | Путь                 | Описание                                           |
| ------ | -------------------- | -------------------------------------------------- |
| `POST` | `/auth/otp`          | Отправить OTP-код в Telegram пользователя          |
| `POST` | `/auth/verify`       | Верифицировать OTP, выдать JWT cookies             |
| `POST` | `/auth/refresh`      | Ротация refresh-token (family invalidation)        |
| `POST` | `/auth/logout`       | Очистить auth cookies                              |
| `POST` | `/auth/bot-register` | Регистрация/поиск пользователя из бота, JWT в body |
| `POST` | `/auth/mini-app`     | Авторизация через Telegram Mini App (HMAC-SHA256)  |

### Receipts
| Метод   | Путь                | Описание                                                          |
| ------- | ------------------- | ----------------------------------------------------------------- |
| `POST`  | `/receipts/upload`  | Загрузить чек в S3, создать Receipt, поставить в очередь OCR      |
| `GET`   | `/receipts/summary` | Годовая статистика: расходы по месяцам, вычет 13%, процент лимита |
| `GET`   | `/receipts`         | Список чеков с группировкой по месяцам (фильтры: year, month)     |
| `GET`   | `/receipts/{id}`    | Детали чека: позиции, presigned URL изображения                   |
| `PATCH` | `/receipts/{id}`    | Частичное обновление (дата, аптека, сумма, позиции)               |

### Batch
| Метод  | Путь                 | Описание                                                  |
| ------ | -------------------- | --------------------------------------------------------- |
| `POST` | `/batch`             | Загрузить N файлов, создать BatchJob, поставить в очередь |
| `GET`  | `/batch/{id}`        | Статус batch job (счётчики done/review/failed)            |
| `GET`  | `/batch/{id}/stream` | SSE-поток real-time прогресса (heartbeat 15 сек)          |

### Prescriptions
| Метод    | Путь                            | Описание                                      |
| -------- | ------------------------------- | --------------------------------------------- |
| `POST`   | `/prescriptions`                | Создать рецепт (тип, врач, клиника, препарат) |
| `POST`   | `/prescriptions/{id}/photo`     | Загрузить фото рецепта в S3                   |
| `GET`    | `/prescriptions/{id}/pdf-blank` | Получить/сгенерировать PDF бланк 107-1/у      |
| `GET`    | `/prescriptions`                | Список рецептов (фильтры: doc_type, статус)   |
| `GET`    | `/prescriptions/{id}`           | Детали рецепта                                |
| `DELETE` | `/prescriptions/{id}`           | Soft-delete (статус → deleted)                |
| `POST`   | `/prescriptions/link`           | Связать рецепт с позицией чека                |

### Export
| Метод  | Путь                 | Описание                                                   |
| ------ | -------------------- | ---------------------------------------------------------- |
| `POST` | `/export?year=<int>` | Инициировать экспорт ZIP (реестр + письмо + чеки) для года |
| `GET`  | `/export/{id}`       | Статус ExportJob + presigned URL для скачивания ZIP        |

---

## OCR-пайплайн

`pipeline.py` запускает параллельно:

1. **QR decode** (sync, < 0.5 сек) — pyzbar + OpenCV, 5 стратегий
2. **EasyOCR** (thread) — fallback на Tesseract если < 5 блоков, таймаут 120 сек
3. **ReceiptAgeEstimator** — если дата чека > 12 мес, QR пропускается
4. **ResultMerger** — 6 стратегий: `merged/merged_date_conflict/fns_only/ocr_only/conflict/both_failed`
5. **DrugNormalizer** — rapidfuzz против GRLS JSON, определяет `is_rx`

Confidence: ≥0.85 → DONE, 0.20–0.84 → REVIEW, <0.20 → FAILED

**Классификатор** (`batch_classifier.py`): перед OCR определяет тип документа (receipt/prescription). Fallback: если Tesseract не распознаёт → receipt с confidence=0.50.

## Безопасность и 152-ФЗ

- **RLS**: `SET LOCAL app.current_user_id = :uid` через `middleware/rls.py`. Celery использует роль `medvychet_worker` с `BYPASS RLS`
- **S3**: только pre-signed URL с TTL 15 мин
- **JWT**: httpOnly cookie, access TTL 15 мин, refresh TTL 30 дней с rotation (family invalidation)
- **ПД**: телефон → SHA-256 (нормализация: `+7 (912) 481-57-60` → `+79124815760`); ФИО/ИНН/СНИЛС → AES-256 `EncryptedString`
- Все данные только в РФ (YOS ЦОД)

## SSE (real-time прогресс batch)

Celery → `sse_publisher.py` → Redis PubSub канал `batch:{id}` → FastAPI `StreamingResponse` → клиент. Heartbeat 15 сек. По завершении batch — Telegram-уведомление пользователю.

## Авторизация

**ЛК**: `/auth/otp` + `/auth/verify` через nginx → backend. OTP в Telegram. Телефон нормализуется в `routers/auth.py`.

**Mini App**: HMAC-SHA256 верификация `initData` на backend.

## FNS Open API (будущая интеграция)

Реализуется в `services/ocr/step1_fns.py`. Требует юрлицо + ЭЦП.
Аутентификация: Master-token → SOAP AuthService → Temporary token → header `FNS-OpenApi-Token`.
Асинхронный: `SendMessage` → `MessageId` → поллинг `GetMessage` до `COMPLETED`.
