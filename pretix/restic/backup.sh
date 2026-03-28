#!/bin/sh
set -eu

POSTGRES_TIMEOUT=60

wait_for_postgres() {
  elapsed=0
  while ! pg_isready -q; do
    elapsed=$((elapsed + 1))
    if [ "$elapsed" -ge "$POSTGRES_TIMEOUT" ]; then
      echo "ERROR: Postgres not ready after ${POSTGRES_TIMEOUT}s" >&2
      exit 1
    fi
    echo "Waiting for Postgres... (${elapsed}/${POSTGRES_TIMEOUT}s)"
    sleep 1
  done
}

wait_for_postgres
restic backup --tag pretix_postgres --stdin-filename pretix_postgres.dump --stdin-from-command -- pg_dump -Fc

restic backup --tag pretix_pretix /pretix
