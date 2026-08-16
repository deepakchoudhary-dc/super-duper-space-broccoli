#!/usr/bin/env bash
#
# PostgreSQL backup script — logical dump with retention + optional S3 offload.
#
# Usage:
#   DB_NAME=api_guardian DB_USER=postgres BACKUP_DIR=/var/backups/pg \
#     ./scripts/ops/backup.sh
#
# Optional:
#   DB_HOST, DB_PORT, DB_PASSWORD, RETENTION_DAYS (default 14),
#   S3_BUCKET=s3://bucket/path  (aws cli required for offload)
#
# Safe to run from cron:
#   0 2 * * * DB_NAME=api_guardian DB_USER=postgres /opt/guardian/scripts/ops/backup.sh

set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-api_guardian}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/pg}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
S3_BUCKET="${S3_BUCKET:-}"

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d_%H%M%S)"
DUMP_FILE="${BACKUP_DIR}/${DB_NAME}_${STAMP}.sql.gz"

echo "[backup] starting dump of ${DB_NAME} -> ${DUMP_FILE}"

PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-privileges \
  --format=custom \
  | gzip > "$DUMP_FILE"

# Integrity check — the dump must be a readable gzip stream
gzip -t "$DUMP_FILE"
echo "[backup] dump verified ($(du -h "$DUMP_FILE" | cut -f1))"

# Offload to S3 when configured
if [[ -n "$S3_BUCKET" ]]; then
  aws s3 cp "$DUMP_FILE" "${S3_BUCKET%/}/$(basename "$DUMP_FILE")" --only-show-errors
  echo "[backup] offloaded to ${S3_BUCKET}"
fi

# Retention: prune local dumps older than RETENTION_DAYS
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -type f -mtime "+${RETENTION_DAYS}" -delete
echo "[backup] pruned dumps older than ${RETENTION_DAYS} days"

echo "[backup] complete"
