#!/bin/bash

# Скрипт для коммита и пуша в GitHub
# Использование: ./push.sh "Сообщение коммита"

set -e

cd /opt/medvychet

# Проверяем, есть ли изменения
if git diff --quiet && git diff --cached --quiet && [ -z "$(git status --porcelain)" ]; then
    echo "Нет изменений для коммита."
    exit 0
fi

# Сообщение коммита
if [ -z "$1" ]; then
    echo "Введите сообщение коммита:"
    read -r COMMIT_MSG
else
    COMMIT_MSG="$1"
fi

if [ -z "$COMMIT_MSG" ]; then
    echo "Ошибка: сообщение коммита не может быть пустым."
    exit 1
fi

echo ""
echo "=== Статус изменений ==="
git status --short

echo ""
echo "=== Добавляем все файлы ==="
git add -A

echo ""
echo "=== Создаём коммит ==="
git commit -m "$COMMIT_MSG"

echo ""
echo "=== Пушим в GitHub ==="
git push origin $(git branch --show-current)

echo ""
echo "Готово! Изменения отправлены в GitHub."
