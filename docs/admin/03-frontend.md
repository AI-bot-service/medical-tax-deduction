# Frontend (Next.js)

## Описание

Веб-приложение личного кабинета пользователя. Реализовано на Next.js 15 App Router с TypeScript, Tailwind CSS и ShadCN/ui. Поддерживает Telegram Mini App.

**Контейнер Docker Compose:** `frontend`
**Порт:** `127.0.0.1:3000` (доступен только через Nginx)

---

## Настройки модуля

Переменные окружения для frontend-контейнера:

| Переменная              | Обязательная | Описание                                                      |
|-------------------------|:------------:|---------------------------------------------------------------|
| `BACKEND_URL`           | да           | URL backend внутри Docker-сети (`http://backend:8000`)        |
| `NEXT_PUBLIC_BACKEND_URL`| да          | Публичный URL backend для клиентских запросов                 |
| `NEXT_PUBLIC_TG_BOT_USERNAME` | нет    | Username Telegram-бота (для ссылки на Mini App)               |

В `docker-compose.yml` переменная задаётся явно:
```yaml
environment:
  BACKEND_URL: http://backend:8000
```

### Конфигурация Next.js (`next.config.js`)

Ключевые параметры:
- `output: 'standalone'` — оптимизированная сборка для Docker
- Proxy-правила для API-запросов через `rewrites`
- Настройки CSP заголовков

---

## Ключевые файлы

| Файл                           | Назначение                                          |
|--------------------------------|-----------------------------------------------------|
| `src/lib/api.ts`               | Fetch-wrapper: автоматический retry при 401, refresh JWT |
| `src/lib/store.ts`             | Zustand хранилища: `authStore`, `batchStore`, `reviewStore` |
| `src/lib/sse.ts`               | SSE-клиент для real-time прогресса batch            |
| `src/app/(cabinet)/`           | Защищённые страницы личного кабинета                |
| `src/app/(auth)/`              | Страницы авторизации                                |
| `src/hooks/useBatchSSE.ts`     | React hook для подключения к SSE-потоку             |

---

## Запуск

### В Docker Compose

```bash
docker compose -f infra/docker-compose.yml up -d frontend
```

### Локальная разработка

```bash
cd frontend
npm install
npm run dev       # http://localhost:3000
```

### Production сборка

```bash
cd frontend
npm run build
npm start         # или запустить через контейнер
```

### Пересборка контейнера

```bash
docker compose -f infra/docker-compose.yml build frontend
docker compose -f infra/docker-compose.yml up -d --no-deps frontend
```

---

## Дебаг модуля

### Просмотр логов

```bash
# Следить за логами
docker compose -f infra/docker-compose.yml logs -f frontend

# Последние 100 строк
docker compose -f infra/docker-compose.yml logs --tail=100 frontend
```

### Войти в контейнер

```bash
docker compose -f infra/docker-compose.yml exec frontend sh
```

### Проверить сборку

```bash
# Проверить TypeScript типы
docker compose -f infra/docker-compose.yml exec frontend npm run tsc

# Проверить линтер
docker compose -f infra/docker-compose.yml exec frontend npm run lint
```

### Проверить доступность frontend

```bash
curl -I http://localhost:3000
# Ожидается HTTP/1.1 200 OK
```

### Проверить что frontend достигает backend

```bash
docker compose -f infra/docker-compose.yml exec frontend \
  wget -qO- http://backend:8000/api/v1/health
```

### Ошибки сборки Next.js

```bash
# Просмотр детальных ошибок сборки
docker compose -f infra/docker-compose.yml logs frontend 2>&1 | grep -A 5 "Error\|error"
```

### Типичные ошибки и решения

| Ошибка                                     | Причина                                   | Решение                                             |
|--------------------------------------------|-------------------------------------------|-----------------------------------------------------|
| `ECONNREFUSED http://backend:8000`         | Backend не запущен или не готов           | `docker compose up -d backend` и подождать healthcheck |
| `401 Unauthorized` при каждом запросе      | JWT истёк и refresh не работает           | Проверить `JWT_SECRET_KEY` совпадает с backend      |
| Белый экран в браузере                     | Ошибка JS, видна в DevTools Console       | Открыть F12 → Console для деталей                  |
| `CORS error` в браузере                    | Несоответствие `FRONTEND_URL` на backend  | Убедиться что `FRONTEND_URL` в `.env` = URL фронта  |
| SSE не работает (нет обновлений)           | Nginx буферизует SSE                      | Проверить nginx конфиг — нужен `proxy_buffering off` |
| Модуль не найден при сборке                | Не установлены зависимости                | `npm install` внутри контейнера                     |
| Hydration mismatch                         | Разница SSR/Client рендеринга             | Проверить использование `useEffect` для client-only данных |

### Отладка SSE (Server-Sent Events)

```bash
# Проверить SSE-поток напрямую
curl -N -H "Cookie: access_token=<JWT>" \
  https://medvychet.systemtool.online/api/v1/batch/<batch_id>/stream
```

Должны приходить строки вида:
```
data: {"status": "processing", "progress": 50, "receipt_id": "..."}
```

---

## Метрики и мониторинг

- **Sentry**: ошибки клиентского JS автоматически отправляются через `@sentry/nextjs`
- **Core Web Vitals**: встроены в Next.js, видны в Google PageSpeed
- **Логи сервера**: в контейнере (`docker compose logs frontend`)
