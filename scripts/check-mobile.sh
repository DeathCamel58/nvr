#!/bin/sh
# Проверка мобильного приложения.
#
# Запуск из каталога проекта:  ./scripts/check-mobile.sh
#
# Почему в контейнере: на сервере нет Node.js, а ставить его на рабочий
# объект ради проверки незачем. Каталог node_modules принадлежит root, и
# npm ci отказывается работать не от root — запускаем от root внутри
# контейнера, файлы остаются с прежним владельцем.
#
# ВАЖНО: на 25.11.2026 `npm ci` не проходит — package.json и
# package-lock.json разошлись (в lock нет @react-native-async-storage
# 1.24.0). Поэтому здесь `npm install`, а после того как lock-файл
# обновят и закоммитят, команду стоит вернуть на `npm ci`: ci ставит ровно
# то, что в lock, и не меняет его молча.
set -e

cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
    echo "docker не найден — проверка мобильного приложения пропущена"
    exit 0
fi

echo "== зависимости =="
docker run --rm \
    -v "$PWD/mobile":/app \
    -v /tmp/npmhome:/home/npm \
    -e HOME=/tmp/npmhome \
    -w /app node:20-bookworm \
    sh -c "npm install --no-audit --no-fund --silent"

echo "== типы =="
docker run --rm -v "$PWD/mobile":/app -w /app node:20-bookworm \
    sh -c "./node_modules/.bin/tsc --noEmit"

echo "== тесты =="
docker run --rm -v "$PWD/mobile":/app -w /app node:20-bookworm \
    sh -c "./node_modules/.bin/jest --silent"

echo "== готово =="
