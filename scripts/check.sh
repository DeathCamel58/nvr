#!/bin/sh
# Одна проверка перед коммитом.
#
# Запуск из каталога проекта:  ./scripts/check.sh
#
# ВАЖНО про запуск в контейнере: этот образ собран с ENTRYPOINT, который
# запускает детектор (`python3 main.py`). Если вызвать
# `docker run ... python3 test_x.py`, аргумент добавляется к entrypoint, и
# вместо теста стартует детектор — он идёт в NATS, не находит сервер и
# сыплет трейсбеками. Поэтому здесь явно указан --entrypoint.
set -e

cd "$(dirname "$0")/.."

echo "== go build и go test =="
if command -v docker >/dev/null 2>&1; then
    docker run --rm \
        -v "$PWD/backend":/app \
        -v nvr-gomod:/go/pkg/mod \
        -v nvr-gocache:/root/.cache/go-build \
        -w /app golang:1.22-alpine \
        sh -c "go build ./... && go test ./..."
else
    echo "docker не найден — пропущено"
fi

echo "== webui: сборка =="
if command -v npm >/dev/null 2>&1; then
    (cd webui && npm run build --silent)
else
    echo "npm не найден — пропущено"
fi

echo "== детектор: юнит-тесты =="
# test_pipeline.py сюда НЕ входит: это ручная проверка живой камеры через
# NATS, а не юнит-тест.
if docker image inspect nvr-ai-detector:latest >/dev/null 2>&1; then
    for t in test_detection_config.py test_detection_engines.py test_plate_format.py; do
        echo "--- $t"
        docker run --rm --entrypoint python3 \
            -v "$PWD/ai-detector":/app -w /app \
            nvr-ai-detector:latest "$t"
    done
else
    echo "образ nvr-ai-detector не собран — пропущено"
fi

echo "== готово =="
