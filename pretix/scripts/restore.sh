#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

docker compose -f "$ROOT_DIR/docker-compose.yml" run --rm --entrypoint sh pretix_restic /scripts/restore.sh
chown -R 15371:15371 "$ROOT_DIR/pretix/data/pretix"
chown 15371:15371 "$ROOT_DIR/pretix/pretix.cfg"
