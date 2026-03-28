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

restic restore --tag pretix_pretix latest --target /

wait_for_postgres
restic dump --tag pretix_postgres latest pretix_postgres.dump > /tmp/pretix_postgres.dump
pg_restore --clean --if-exists -d "$PGDATABASE" /tmp/pretix_postgres.dump
rm -f /tmp/pretix_postgres.dump
