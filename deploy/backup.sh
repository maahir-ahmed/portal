#!/bin/sh
# Backs up one stack: the Postgres database and the uploads volume, into /backups.
#
# Runs inside the backup container, not on the host. The host-cron version of this
# script sat in the README for months and was never installed, so nothing was ever
# backed up — a service that comes up with the stack cannot be forgotten.
#
#   loop  (default) back up on start, then daily at BACKUP_HOUR
#   once            back up and exit — `docker compose … run --rm backup once`
#   next            print seconds until the next run and exit (checks the maths)
set -eu

OUT=/backups
STACK="${STACK:-rubric}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
HOUR="${BACKUP_HOUR:-3}"

# Leading zeros would be read as octal, and busybox has no %-H.
num() { echo "$1" | sed 's/^0*//; s/^$/0/'; }

# Seconds until the next HOUR o'clock, from the clock rather than `date -d`, which
# busybox does not have: it returned a negative sleep and put the container in a
# restart loop that backed up every few seconds. Always in (0, 86400].
seconds_until_hour() {
  now=$(( $(num "$(date +%H)") * 3600 + $(num "$(date +%M)") * 60 + $(num "$(date +%S)") ))
  delta=$(( $(num "$HOUR") * 3600 - now ))
  [ "$delta" -le 0 ] && delta=$(( delta + 86400 ))
  echo "$delta"
}

backup() {
  stamp=$(date +%F_%H%M)
  mkdir -p "$OUT"

  # A container killed mid-dump leaves a .part behind; clear this stack's before
  # starting so they cannot pile up unnoticed.
  rm -f "$OUT/${STACK}_"*.part

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

  # -exec rm rather than -delete: busybox find does not always carry -delete.
  find "$OUT" -name "${STACK}_*" -mtime "+$KEEP_DAYS" -exec rm -f {} +
}

if [ "${1:-loop}" = "once" ]; then
  backup
  exit 0
fi

# `next` prints the wait and exits — how the schedule maths is checked without
# waiting a day to find out it was wrong.
if [ "${1:-loop}" = "next" ]; then
  seconds_until_hour
  exit 0
fi

# One backup on start so a fresh stack has something within seconds instead of
# waiting until tomorrow morning, then daily at BACKUP_HOUR.
backup
while true; do
  delta=$(seconds_until_hour)
  echo "$(date -Is) next backup in ${delta}s"
  sleep "$delta"
  backup
done
