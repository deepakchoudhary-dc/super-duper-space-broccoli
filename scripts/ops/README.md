# Operations runbooks

Production-grade operational tooling: connection pooling, Redis high
availability, and PostgreSQL backup/restore.

## 1. PgBouncer (connection pooling)

Protects PostgreSQL from connection storms when many gateway instances (or a
high-VU load test) open connections concurrently.

```bash
# generate a scram hash for your DB user, then fill pgbouncer-userlist.txt
# point the gateway at the pooler:
DB_HOST=localhost DB_PORT=6432 npm run server:start
```

Files:
- `pgbouncer.ini` — pooler config (transaction mode, 20 pool size)
- `pgbouncer-userlist.txt` — scram-sha-256 user entries (REPLACE the placeholders!)

## 2. Redis HA (Sentinel)

Three Redis nodes + three Sentinels. Sentinel auto-promotes a replica when the
primary fails; the gateway degrades gracefully anyway (in-memory fallback),
but HA keeps rate-limit/cache/blacklist state consistent across node loss.

```bash
docker compose -f scripts/ops/redis-ha/docker-compose.yml up -d
```

Point the gateway at any sentinel for discovery:
```
REDIS_HOST=sentinel-1 REDIS_PORT=26379 REDIS_SENTINEL_MASTER=guardian-primary
```

## 3. PostgreSQL backups

Logical dumps with gzip + retention + optional S3 offload.

```bash
# full dump
DB_NAME=api_guardian DB_USER=postgres ./scripts/ops/backup.sh

# restore (DROPS the target database first!)
DB_NAME=api_guardian DB_USER=postgres ./scripts/ops/restore.sh /var/backups/pg/api_guardian_20240101_020000.sql.gz

# cron: nightly at 02:00, 14-day retention, S3 offload
0 2 * * * DB_NAME=api_guardian DB_USER=postgres S3_BUCKET=s3://guardian-backups /opt/guardian/scripts/ops/backup.sh
```

Restore safety: always restore to a scratch database first
(`DB_NAME=api_guardian_restore_test`) and sanity-check row counts before
pointing traffic at it.
