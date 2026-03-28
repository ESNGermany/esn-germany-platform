#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

chown -R 15371:15371 "$ROOT_DIR/pretix/data/pretix"
chown 15371:15371 "$ROOT_DIR/pretix/pretix.cfg"
docker compose -f "$ROOT_DIR/docker-compose.yml" run --rm pretix_init
docker compose -f "$ROOT_DIR/docker-compose.yml" run --rm --entrypoint sh pretix_restic -c "restic init"
