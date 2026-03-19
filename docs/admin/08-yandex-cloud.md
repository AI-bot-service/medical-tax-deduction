# Yandex Cloud — Инфраструктура

## Описание

Все компоненты платформы MedВычет размещены в Yandex Cloud на территории РФ. Это требование 152-ФЗ о персональных данных.

---

## Используемые сервисы

| Сервис                    | Назначение в проекте                                        |
|---------------------------|-------------------------------------------------------------|
| **Compute Cloud (VM/VDS)**| Хостинг всего стека (Docker Compose + Nginx)                |
| **Object Storage (S3)**   | Хранение файлов: чеки, рецепты, ZIP-экспорты               |
| **Cloud DNS** (опционально)| Управление DNS-записями домена                             |
| **Certificate Manager** (опционально)| TLS-сертификаты от Let's Encrypt через YC     |

---

## Compute Cloud (Виртуальная машина)

### Минимальные требования для production

| Параметр      | Минимум         | Рекомендуется        |
|---------------|-----------------|----------------------|
| CPU           | 2 vCPU          | 4 vCPU               |
| RAM           | 4 GB            | 8 GB (EasyOCR ~2 GB) |
| Диск          | 30 GB SSD       | 60 GB SSD            |
| ОС            | Ubuntu 22.04 LTS| Ubuntu 22.04 LTS     |
| Зона          | `ru-central1-a` | `ru-central1-a`      |

> EasyOCR загружает тяжёлые модели в RAM — меньше 4 GB для воркера не рекомендуется.

### Создание VM

1. Yandex Cloud Console → Compute Cloud → Создать виртуальную машину
2. Зона доступности: `ru-central1-a`
3. ОС: Ubuntu 22.04 LTS
4. Тип диска: SSD, от 30 GB
5. Публичный IP: статический (чтобы не менялся при перезагрузке)
6. SSH-ключ: добавить свой публичный ключ

### Настройка после создания VM

```bash
# Подключиться по SSH
ssh ubuntu@<ПУБЛИЧНЫЙ_IP>

# Обновить систему
sudo apt update && sudo apt upgrade -y

# Установить Docker
curl -fsSL https://get.docker.com | sudo bash
sudo usermod -aG docker $USER

# Установить Docker Compose
sudo apt install docker-compose-plugin -y

# Установить Nginx
sudo apt install nginx -y

# Установить Certbot
sudo apt install certbot -y
```

### Настройка DNS

Создать A-запись у регистратора домена:
```
medvychet.systemtool.online → <ПУБЛИЧНЫЙ_IP_VM>
```

Или через Yandex Cloud DNS:
1. Cloud DNS → Создать зону → `systemtool.online`
2. Добавить A-запись: `medvychet` → `<IP>`

---

## Object Storage (S3-совместимое хранилище)

### Настройка доступа

#### Шаг 1: создать сервисный аккаунт

1. IAM → Сервисные аккаунты → Создать
2. Имя: `medvychet-s3`
3. Назначить роли: `storage.editor`

#### Шаг 2: создать статический ключ доступа

1. Открыть аккаунт `medvychet-s3`
2. Вкладка "Ключи доступа" → Создать статический ключ
3. Скопировать:
   - **Идентификатор ключа** → `YOS_ACCESS_KEY`
   - **Секретный ключ** → `YOS_SECRET_KEY` (показывается только один раз!)

#### Шаг 3: создать бакеты

Через веб-консоль (Object Storage → Создать бакет):
- `medvychet-receipts` — регион `ru-central1`, доступ: **Закрытый**
- `medvychet-prescriptions` — регион `ru-central1`, доступ: **Закрытый**
- `medvychet-exports` — регион `ru-central1`, доступ: **Закрытый**

Через AWS CLI:
```bash
# Установить AWS CLI
pip install awscli

# Настроить профиль для YOS
aws configure --profile yandex
# AWS Access Key ID: <YOS_ACCESS_KEY>
# AWS Secret Access Key: <YOS_SECRET_KEY>
# Default region: ru-central1
# Default output format: json

# Создать бакеты
aws s3 mb s3://medvychet-receipts \
  --endpoint-url https://storage.yandexcloud.net \
  --profile yandex

aws s3 mb s3://medvychet-prescriptions \
  --endpoint-url https://storage.yandexcloud.net \
  --profile yandex

aws s3 mb s3://medvychet-exports \
  --endpoint-url https://storage.yandexcloud.net \
  --profile yandex
```

#### Проверка доступа к S3

```bash
# Список бакетов
aws s3 ls \
  --endpoint-url https://storage.yandexcloud.net \
  --profile yandex

# Загрузить тестовый файл
echo "test" | aws s3 cp - s3://medvychet-receipts/test.txt \
  --endpoint-url https://storage.yandexcloud.net \
  --profile yandex

# Убедиться что файл есть
aws s3 ls s3://medvychet-receipts/ \
  --endpoint-url https://storage.yandexcloud.net \
  --profile yandex

# Удалить тестовый файл
aws s3 rm s3://medvychet-receipts/test.txt \
  --endpoint-url https://storage.yandexcloud.net \
  --profile yandex
```

### Политики хранения (Lifecycle)

Настроить автоматическое удаление старых файлов через веб-консоль:
1. Открыть бакет → вкладка "Жизненный цикл"
2. Добавить правило:
   - Для `medvychet-exports`: удалять объекты старше 90 дней
   - Для `medvychet-receipts`: удалять объекты старше 365 дней (после истечения срока вычета)

### Размер хранилища и стоимость

```bash
# Размер бакета
aws s3 ls s3://medvychet-receipts/ --recursive --human-readable --summarize \
  --endpoint-url https://storage.yandexcloud.net \
  --profile yandex | tail -2
```

Тарифы Yandex Object Storage: ~2 руб/ГБ/месяц (уточнять в [документации YC](https://cloud.yandex.ru/prices)).

---

## Безопасность

### Сетевая безопасность VM

Настроить группу безопасности (Security Group) в Yandex Cloud:

| Направление | Протокол | Порт  | Источник          | Назначение |
|-------------|----------|-------|-------------------|------------|
| Входящий    | TCP      | 22    | Ваш IP/VPN        | SSH        |
| Входящий    | TCP      | 80    | 0.0.0.0/0         | HTTP       |
| Входящий    | TCP      | 443   | 0.0.0.0/0         | HTTPS      |
| Исходящий   | Все      | Все   | 0.0.0.0/0         | Интернет   |

Порты 8000, 3000, 5432, 6379 **не должны быть открыты** в интернет.

### Шифрование данных

- Все файлы в S3 хранятся в зашифрованном виде на стороне YOS (Server-Side Encryption)
- Дополнительно приложение шифрует персональные данные AES-256 перед сохранением
- TLS на всём пути: клиент → Nginx → Backend

### Соответствие 152-ФЗ

- Все данные хранятся только в РФ (Yandex Cloud `ru-central1`, ЦОД Москва)
- Телефоны пользователей хранятся как bcrypt-хеш (необратимо)
- ФИО, ИНН, СНИЛС шифруются AES-256 (`ENCRYPTION_KEY`)
- RLS изолирует данные между пользователями на уровне СУБД

---

## Мониторинг

### Yandex Monitoring

1. Yandex Cloud Console → Monitoring → Создать дашборд
2. Добавить метрики:
   - VM: CPU, RAM, Disk I/O
   - Object Storage: количество запросов, объём данных
   - Алерты на CPU > 80% и Disk > 80%

### Настройка алертов

1. Monitoring → Алерты → Создать
2. Пример: `cpu_usage > 80%` → уведомить на email

---

## Диагностика Yandex Cloud

### Проверить доступность S3 из контейнера

```bash
docker compose -f infra/docker-compose.yml exec backend \
  python -c "
import boto3
import os
s3 = boto3.client(
    's3',
    endpoint_url='https://storage.yandexcloud.net',
    aws_access_key_id=os.environ['YOS_ACCESS_KEY'],
    aws_secret_access_key=os.environ['YOS_SECRET_KEY'],
    region_name='ru-central1'
)
response = s3.list_buckets()
print([b['Name'] for b in response['Buckets']])
"
```

### Проверить pre-signed URL

```bash
docker compose -f infra/docker-compose.yml exec backend \
  python -c "
import boto3, os
s3 = boto3.client(
    's3',
    endpoint_url='https://storage.yandexcloud.net',
    aws_access_key_id=os.environ['YOS_ACCESS_KEY'],
    aws_secret_access_key=os.environ['YOS_SECRET_KEY'],
    region_name='ru-central1'
)
url = s3.generate_presigned_url(
    'get_object',
    Params={'Bucket': 'medvychet-receipts', 'Key': 'test.txt'},
    ExpiresIn=900
)
print(url)
"
```

### Типичные ошибки YOS

| Ошибка                          | Причина                                    | Решение                                        |
|---------------------------------|--------------------------------------------|------------------------------------------------|
| `NoSuchBucket`                  | Бакет не создан                            | Создать бакет в консоли                        |
| `AccessDenied`                  | Неверные ключи или нет прав у аккаунта     | Проверить ключи и роль `storage.editor`        |
| `InvalidAccessKeyId`            | Неверный `YOS_ACCESS_KEY`                  | Пересоздать статический ключ                   |
| `SignatureDoesNotMatch`         | Неверный `YOS_SECRET_KEY` или регион       | Проверить `YOS_SECRET_KEY` и `YOS_REGION`      |
| Pre-signed URL не работает      | Время на VM расходится с серверным         | Синхронизировать время: `timedatectl set-ntp on` |
