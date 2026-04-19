#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

docker compose -f "$ROOT_DIR/docker-compose.yml" run --rm --entrypoint sh vault_restic /scripts/backup.sh
