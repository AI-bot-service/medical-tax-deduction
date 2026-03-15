#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# MedВычет — скрипт инициализации Git-репозитория
# Запускать ОДИН РАЗ после создания пустого репозитория на GitHub
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Настройки — ЗАПОЛНИ ДО ЗАПУСКА ───────────────────────────────
GITHUB_USER="AI-bot-service"
REPO_NAME="medvychet"
# Пример: https://github.com/yourname/medvychet.git
REMOTE_URL="https://github.com/${GITHUB_USER}/${REPO_NAME}.git"
# ─────────────────────────────────────────────────────────────────

echo "🚀 Инициализация репозитория MedВычет"
echo "   Remote: ${REMOTE_URL}"
echo ""

# Проверяем что мы в корне проекта
if [ ! -f "docker-compose.yml" ]; then
  echo "❌ Запускай скрипт из корня проекта (рядом с docker-compose.yml)"
  exit 1
fi

# Git init
git init
git checkout -b main

# Первый коммит — структура проекта
git add .
git commit -m "feat: initial project structure

- FastAPI backend skeleton (app/, api/, models/, services/)
- Celery OCR pipeline (EasyOCR + Tesseract + ФНС Open API)
- Telegram bot handlers (receipts, prescriptions, summary)
- PostgreSQL models + Alembic initial migration
- Docker Compose (postgres, redis, backend, celery, flower, bot)
- Yandex Object Storage integration
- GitHub Actions CI workflow
- PRD v2.0 documentation

Refs: #1"

# Устанавливаем remote и пушим
git remote add origin "${REMOTE_URL}"
git push -u origin main

echo ""
echo "✅ Готово! Репозиторий создан и запушен."
echo ""
echo "📋 Следующие шаги:"
echo "   1. Создай ветку разработки:"
echo "      git checkout -b develop && git push -u origin develop"
echo ""
echo "   2. Скопируй .env.example в .env и заполни переменные:"
echo "      cp .env.example .env"
echo ""
echo "   3. Запусти сервисы:"
echo "      docker compose up -d"
echo "      docker compose exec backend alembic upgrade head"
echo ""
echo "   4. Подай заявку на ФНС Open API: kkt@nalog.ru"
echo "      (Мастер-токен нужен для FNS_MASTER_TOKEN в .env)"
echo ""
echo "   5. Проверь что CI прошёл на GitHub Actions ✅"
