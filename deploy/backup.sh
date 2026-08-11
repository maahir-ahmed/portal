#!/usr/bin/env bash
# Nightly Postgres backups for both stacks. Keeps last 14 days.
# Cron: 0 3 * * *  /path/to/society-project/deploy/backup.sh >> /path/to/rubric-backup.log 2>&1
set -euo pipefail

OUT="${BACKUP_DIR:-$HOME/containers/rubric-backups}"
KEEP_DAYS=14
mkdir -p "$OUT"

for stack in rubric_prod rubric_dev; do
  cid=$(docker ps -qf "name=${stack}-db-1") || true
  [ -z "$cid" ] && { echo "skip $stack (db not running)"; continue; }
  f="$OUT/${stack}_$(date +%F_%H%M).sql.gz"
  docker exec "$cid" pg_dump -U society_user society_platform | gzip > "$f"
  echo "wrote $f"
done

find "$OUT" -name '*.sql.gz' -mtime +$KEEP_DAYS -delete
