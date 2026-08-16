#!/usr/bin/env bash
#
# PostgreSQL restore script — restores a gzipped custom-format dump.
#
# Usage:
#   DB_NAME=api_guardian DB_USER=postgres ./scripts/ops/restore.sh /path/to/dump.sql.gz
#
# Optional: DB_HOST, DB_PORT, DB_PASSWORD.
#
# WARNING: This DROPS and recreates the target database. Run against a
# scratch database first to validate the dump before touching production.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <dump.sql.gz>" >&2
  exit 1
fi

DUMP_FILE="$1"
if [[ ! -f "$DUMP_FILE" ]]; then
  echo "[restore] dump file not found: ${DUMP_FILE}" >&2
  exit 1
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-api_guardian}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-}"

echo "[restore] verifying gzip integrity"
gzip -t "$DUMP_FILE"

echo "[restore] dropping existing database ${DB_NAME} (if any)"
PGPASSWORD="$DB_PASSWORD" dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" --if-exists "$DB_NAME"

echo "[restore] creating fresh database ${DB_NAME}"
PGPASSWORD="$DB_PASSWORD" createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"

echo "[restore] restoring ${DUMP_FILE}"
gunzip -c "$DUMP_FILE" | PGPASSWORD="$DB_PASSWORD" pg_restore \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-privileges \
  --exit-on-error

echo "[restore] complete"
