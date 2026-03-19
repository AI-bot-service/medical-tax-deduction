# Nginx (Reverse Proxy)

## Описание

Nginx выступает единой точкой входа: терминирует TLS, проксирует запросы к Frontend и Backend, обеспечивает корректную работу SSE-потоков.

Доступны два варианта конфигурации:
- **Docker Compose**: `infra/nginx/nginx.conf` — nginx запускается внутри Docker
- **Host (production)**: `infra/nginx/medvychet.systemtool.online.conf` — nginx установлен на хосте как системный сервис

---

## Маршрутизация запросов

| Паттерн URL                              | Upstream         | Особенности                                          |
|------------------------------------------|------------------|------------------------------------------------------|
| `/api/v1/batch/<id>/stream`              | `backend:8000`   | SSE: `proxy_buffering off`, `proxy_cache off`, timeout 300s |
| `/api/*`                                 | `backend:8000`   | REST API, timeout 120s                               |
| `/`                                      | `frontend:3000`  | Next.js                                              |

> **Важно:** `/api/auth/*` (без `/v1/`) — это Next.js API route handlers, но фронтенд явно использует `/api/v1/auth/*`, чтобы запросы уходили напрямую в backend через nginx. Промежуточный прокси через Next.js не нужен.

---

## Настройки модуля

Конфигурационные файлы: `infra/nginx/nginx.conf` и `infra/nginx/medvychet.systemtool.online.conf`.

### Ключевые директивы

| Директива                  | Значение       | Назначение                                          |
|----------------------------|----------------|-----------------------------------------------------|
| `client_max_body_size`     | `20M`          | Максимальный размер загружаемого файла (фото чека)  |
| `proxy_read_timeout`       | `120s` / `300s`| Таймаут ответа от upstream (300s для SSE)           |
| `proxy_buffering off`      | для SSE        | Отключить буферизацию для Server-Sent Events        |
| `ssl_protocols`            | TLSv1.2 TLSv1.3| Только современные протоколы                        |
| `ssl_session_cache`        | `shared:SSL:10m`| Кэш TLS-сессий для ускорения повторных соединений  |

### SSL-сертификаты

Сертификаты должны быть в `/etc/ssl/medvychet/`:
- `fullchain.pem` — сертификат + цепочка CA
- `key.pem` — приватный ключ

---

## Получение SSL-сертификата (Let's Encrypt)

### Шаг 1: первичное получение через nginx-init.conf

```bash
# Скопировать временный конфиг
cp infra/nginx/nginx-init.conf /etc/nginx/sites-available/medvychet
ln -s /etc/nginx/sites-available/medvychet /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Получить сертификат через certbot
certbot certonly --webroot \
  -w /var/www/certbot \
  -d medvychet.systemtool.online \
  --email admin@example.com \
  --agree-tos

# Скопировать сертификаты
mkdir -p /etc/ssl/medvychet
cp /etc/letsencrypt/live/medvychet.systemtool.online/fullchain.pem /etc/ssl/medvychet/
cp /etc/letsencrypt/live/medvychet.systemtool.online/privkey.pem /etc/ssl/medvychet/key.pem
```

### Шаг 2: подключить основной конфиг

```bash
cp infra/nginx/medvychet.systemtool.online.conf \
   /etc/nginx/sites-available/medvychet.systemtool.online
ln -sf /etc/nginx/sites-available/medvychet.systemtool.online \
       /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### Автообновление сертификата

```bash
# Добавить в crontab
0 3 * * * certbot renew --quiet && \
  cp /etc/letsencrypt/live/medvychet.systemtool.online/fullchain.pem /etc/ssl/medvychet/ && \
  cp /etc/letsencrypt/live/medvychet.systemtool.online/privkey.pem /etc/ssl/medvychet/key.pem && \
  systemctl reload nginx
```

---

## Запуск

### На хосте (production)

```bash
# Проверить конфиг
nginx -t

# Перезагрузить без даунтайма
systemctl reload nginx

# Полный рестарт
systemctl restart nginx

# Статус
systemctl status nginx
```

### В Docker Compose

Nginx не включён в основной `docker-compose.yml` — предполагается что он установлен на хосте. Для локальной разработки можно добавить:

```yaml
nginx:
  image: nginx:alpine
  volumes:
    - ./infra/nginx/nginx.conf:/etc/nginx/conf.d/default.conf
    - /etc/ssl/medvychet:/etc/ssl/medvychet:ro
  ports:
    - "80:80"
    - "443:443"
  depends_on:
    - backend
    - frontend
```

---

## Дебаг модуля

### Просмотр логов

```bash
# Access log
tail -f /var/log/nginx/access.log

# Error log
tail -f /var/log/nginx/error.log

# Только ошибки >= warn
tail -f /var/log/nginx/error.log | grep -E "error|crit|alert|emerg"

# Последние запросы с кодом 5xx
grep " 5[0-9][0-9] " /var/log/nginx/access.log | tail -20
```

### Проверить конфигурацию

```bash
nginx -t
# Ожидается: nginx: configuration file /etc/nginx/nginx.conf syntax is ok
#             nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### Проверить маршрутизацию

```bash
# HTTP → HTTPS redirect
curl -I http://medvychet.systemtool.online
# Ожидается: 301 → https://...

# HTTPS
curl -I https://medvychet.systemtool.online
# Ожидается: 200

# API healthcheck через Nginx
curl https://medvychet.systemtool.online/api/v1/health

# SSE endpoint (должен держать соединение открытым)
curl -N -H "Accept: text/event-stream" \
  https://medvychet.systemtool.online/api/v1/batch/<id>/stream
```

### Проверить SSL-сертификат

```bash
# Срок действия
openssl s_client -connect medvychet.systemtool.online:443 -servername medvychet.systemtool.online \
  2>/dev/null | openssl x509 -noout -dates

# Полная информация
echo | openssl s_client -connect medvychet.systemtool.online:443 2>/dev/null \
  | openssl x509 -text -noout | grep -A 2 "Validity"
```

### Типичные ошибки и решения

| Ошибка                                          | Причина                                        | Решение                                                 |
|-------------------------------------------------|------------------------------------------------|---------------------------------------------------------|
| `502 Bad Gateway`                               | Backend или Frontend не запущен                | `docker compose up -d backend frontend`                 |
| `504 Gateway Timeout`                           | Таймаут ответа от upstream                     | Увеличить `proxy_read_timeout`                          |
| SSE обрывается через 60 секунд                  | Nginx буферизует или таймаут слишком мал       | Убедиться что SSE location имеет `proxy_buffering off` и `proxy_read_timeout 300s` |
| `SSL_ERROR_RX_RECORD_TOO_LONG`                  | HTTP запрос на HTTPS порт                      | Настроить redirect с 80 на 443                          |
| `413 Request Entity Too Large`                  | Файл больше `client_max_body_size`             | Увеличить `client_max_body_size 20M` (уже задано)       |
| `CORS error` несмотря на конфиг backend         | Nginx добавляет/перезаписывает CORS заголовки  | Убрать дублирующие `add_header` из nginx конфига        |
| Сертификат истёк                                | Certbot не обновил вовремя                     | `certbot renew --force-renewal && systemctl reload nginx` |

### Мониторинг активных соединений

```bash
# Активные соединения
nginx -V 2>&1 | grep "with-http_stub_status_module"
# Если модуль есть, добавить location в конфиг:
# location /nginx_status { stub_status; allow 127.0.0.1; deny all; }
curl http://127.0.0.1/nginx_status
```

---

## Оптимизация производительности

```nginx
# Добавить в nginx.conf → http блок:
gzip on;
gzip_types text/plain text/css application/json application/javascript;
gzip_min_length 1000;

# Кэш для статики Next.js
location /_next/static/ {
    proxy_pass http://frontend;
    proxy_cache_valid 200 1y;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```
