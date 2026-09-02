#!/bin/sh
# Backs up one stack: the Postgres database and the uploads volume, into /backups.
#
# Runs inside the backup container, not on the host. The host-cron version of this
# script sat in the README for months and was never installed, so nothing was ever
# backed up — a service that comes up with the stack cannot be forgotten.
#
#   loop  (default) back up on start, then daily at BACKUP_HOUR
#   once            back up and exit — `docker compose … run --rm backup once`
set -eu

OUT=/backups
STACK="${STACK:-rubric}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
HOUR="${BACKUP_HOUR:-3}"

backup() {
  stamp=$(date +%F_%H%M)
  mkdir -p "$OUT"

  # Each file is written under .part and renamed once complete, so a backup cut off
  # halfway never looks like a good one to whoever comes to restore it.
  db="$OUT/${STACK}_${stamp}.sql.gz"
  if PGPASSWORD="$DB_PASSWORD" pg_dump -h db -U society_user society_platform | gzip > "$db.part"; then
    mv "$db.part" "$db"
    echo "$(date -Is) wrote $db ($(wc -c < "$db") bytes)"
  else
    rm -f "$db.part"
    echo "$(date -Is) FAILED database dump for $STACK" >&2
  fi

  # The uploads volume: receipts, printing artwork, meeting minutes. Losing it loses
  # evidence the database only holds the paths to.
  up="$OUT/${STACK}_uploads_${stamp}.tar.gz"
  if tar czf "$up.part" -C /uploads .; then
    mv "$up.part" "$up"
    echo "$(date -Is) wrote $up ($(wc -c < "$up") bytes)"
  else
    rm -f "$up.part"
    echo "$(date -Is) FAILED uploads archive for $STACK" >&2
  fi

  find "$OUT" -name "${STACK}_*" -mtime "+$KEEP_DAYS" -delete
}

if [ "${1:-loop}" = "once" ]; then
  backup
  exit 0
fi

# One backup on start so a fresh stack has something within seconds instead of
# waiting until tomorrow morning, then daily at BACKUP_HOUR.
backup
while true; do
  now=$(date +%s)
  next=$(date -d "today ${HOUR}:00" +%s 2>/dev/null || echo 0)
  [ "$next" -le "$now" ] && next=$((next + 86400))
  sleep $((next - now))
  backup
done
