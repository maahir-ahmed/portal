#!/bin/sh
# Backs up and restores one stack: the Postgres database and the uploads directory,
# together, as one archive.
#
# The same script runs in three places, so a backup from any of them restores with
# any of them: the backup container (daily), the app container (Settings >
# Debugging), and the self-hosting helper scripts. The host-cron version of this sat
# in the README for months and was never installed, so nothing was ever backed up;
# a service that comes up with the stack cannot be forgotten.
#
#   loop  (default)   back up on start, then daily at BACKUP_HOUR
#   once              back up and exit: `docker compose … run --rm backup once`
#   archive           same as once, then print the archive's path on the last line
#   validate <file>   check an archive is whole and its parts belong together
#   restore <file>    validate, then replace the database and uploads with it
#   next              print seconds until the next run and exit (checks the maths)
#
# The archive, <stack>_<stamp>.tar.gz, holds:
#   manifest.json   format, stack, when, the sha256 of database.sql, the upload count
#   database.sql    plain pg_dump, so it also restores by hand with psql
#   uploads/        receipts, printing artwork, minutes, photos, logos
# The manifest is what proves the dump and the uploads were taken together.
#
# Environment: DATABASE_URL (or DB_PASSWORD, for the backup container's `db` host),
# UPLOADS_DIR (default /uploads; must be a directory named "uploads"), BACKUP_OUT
# (default /backups), STACK, BACKUP_KEEP_DAYS, BACKUP_HOUR.
set -eu

OUT="${BACKUP_OUT:-/backups}"
UPLOADS="${UPLOADS_DIR:-/uploads}"
STACK="${STACK:-rubric}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
HOUR="${BACKUP_HOUR:-3}"
FORMAT=1

# libpq rejects Prisma's ?schema=public, so drop the query string.
if [ -n "${DATABASE_URL:-}" ]; then
  PGURL="${DATABASE_URL%%\?*}"
else
  PGURL="postgresql://society_user:${DB_PASSWORD:-}@db:5432/society_platform"
fi

log() { echo "$(date -Is) $*" >&2; }
die() { log "ERROR: $*"; exit 1; }
sha() { sha256sum "$1" | cut -d' ' -f1; }

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

archive() {
  [ "$(basename "$UPLOADS")" = uploads ] || die "UPLOADS_DIR must be a directory named uploads, not $UPLOADS"
  mkdir -p "$OUT"
  # A run killed mid-way leaves a .part and a work directory behind; clear this
  # stack's before starting so they cannot pile up unnoticed.
  rm -rf "$OUT/${STACK}_"*.part "$OUT/.work-${STACK}-"*

  stamp=$(date +%F_%H%M%S)
  work="$OUT/.work-${STACK}-$stamp"
  dest="$OUT/${STACK}_${stamp}.tar.gz"
  mkdir -p "$work"

  if ! pg_dump --clean --if-exists --no-owner --no-privileges "$PGURL" > "$work/database.sql"; then
    rm -rf "$work"
    die "database dump failed for $STACK"
  fi
  count=0
  [ -d "$UPLOADS" ] && count=$(find "$UPLOADS" -type f | wc -l | tr -d ' ')
  printf '{"format":%s,"stack":"%s","created":"%s","database_sha256":"%s","upload_count":%s}\n' \
    "$FORMAT" "$STACK" "$(date -Is)" "$(sha "$work/database.sql")" "$count" > "$work/manifest.json"

  # The uploads go straight from where they live into the archive, through a link
  # tar follows (-h), rather than being copied first, so a large uploads directory
  # does not need twice its size free. A link and not a second -C: busybox tar keeps
  # only the last -C it is given.
  if [ -d "$UPLOADS" ]; then
    ln -s "$(cd "$UPLOADS" && pwd)" "$work/uploads"
  else
    mkdir "$work/uploads"
  fi
  # Written under .part and renamed once complete, so a backup cut off halfway
  # never looks like a good one to whoever comes to restore it.
  if ! tar czhf "$dest.part" -C "$work" manifest.json database.sql uploads; then
    rm -rf "$work" "$dest.part"
    die "archive failed for $STACK"
  fi
  rm -rf "$work"
  mv "$dest.part" "$dest"
  log "wrote $dest ($(wc -c < "$dest" | tr -d ' ') bytes, $count uploads)"

  # -exec rm rather than -delete: busybox find does not always carry -delete.
  find "$OUT" -maxdepth 1 -name "${STACK}_*" -mtime "+$KEEP_DAYS" -exec rm -f {} +
  echo "$dest"
}

# Unpacks an archive into $1 and checks it. Prints a report as key=value lines; exits
# non-zero if the archive is unusable. A missing upload referenced by the database is
# only a warning: a live site can already link to a file someone deleted.
unpack_and_check() {
  file="$1" into="$2"
  [ -f "$file" ] || die "no such archive: $file"
  mkdir -p "$into"
  # Only plain files and folders: archive() follows links (-h), so a real backup never
  # holds a link or a device. (Paths leaving the archive need no check: GNU and busybox
  # tar both strip a leading / and ../ when listing and extracting.) A link in
  # uploads/ would be copied in by restore and served to any signed-in user, reading
  # whatever it points at (the app's environment, its secrets). Checked before
  # extracting, since tar may write through a link it has just made.
  listing=$(tar tzvf "$file" 2>/dev/null) || die "not a readable .tar.gz archive"
  echo "$listing" | grep -q '^[^-d]' && die "archive holds links or special files; backups made by this script never do"
  tar xzf "$file" -C "$into" || die "not a readable .tar.gz archive"
  [ -f "$into/manifest.json" ] || die "archive has no manifest.json; it was not made by this script"
  [ -f "$into/database.sql" ] || die "archive has no database.sql"
  [ -d "$into/uploads" ] || die "archive has no uploads directory"

  # psql runs the dump, and a line starting with a backslash is a psql command: \! runs a
  # shell, \o and \copy write files. pg_dump's own output only has them as COPY data and
  # \restrict / \unrestrict, so anything else means the dump was not made by pg_dump.
  awk '/^COPY .* FROM stdin;$/ { copy = 1; next }
       copy && /^\\\.$/ { copy = 0; next }
       !copy && /^\\/ && !/^\\(restrict|unrestrict) / { bad = 1 }
       END { exit bad }' "$into/database.sql" ||
    die "database.sql holds psql commands; a dump from pg_dump never does"

  manifest=$(cat "$into/manifest.json")
  field() { echo "$manifest" | sed -n "s/.*\"$1\":\"\{0,1\}\([^\",}]*\).*/\1/p"; }
  [ "$(field format)" = "$FORMAT" ] || die "archive format $(field format) is not one this version reads ($FORMAT)"
  [ "$(field database_sha256)" = "$(sha "$into/database.sql")" ] || die "database.sql does not match the manifest: the archive is damaged or was edited"
  found=$(find "$into/uploads" -type f | wc -l | tr -d ' ')
  [ "$(field upload_count)" = "$found" ] || die "manifest lists $(field upload_count) uploads but the archive holds $found"

  missing=0
  for f in $(grep -o '/uploads/[A-Za-z0-9._-]*' "$into/database.sql" | sort -u); do
    [ -f "$into$f" ] || missing=$((missing + 1))
  done
  echo "stack=$(field stack)"
  echo "created=$(field created)"
  echo "uploads=$found"
  echo "database_bytes=$(wc -c < "$into/database.sql" | tr -d ' ')"
  echo "missing_uploads=$missing"
}

validate() {
  tmp="$OUT/.check-$$"
  trap 'rm -rf "$tmp"' EXIT
  unpack_and_check "$1" "$tmp"
}

restore() {
  [ "$(basename "$UPLOADS")" = uploads ] || die "UPLOADS_DIR must be a directory named uploads, not $UPLOADS"
  tmp="$OUT/.restore-$$"
  trap 'rm -rf "$tmp"' EXIT
  unpack_and_check "$1" "$tmp" >&2

  # One transaction (--single-transaction wraps -f input only, hence -f -): the old schema is dropped and the dump loaded together, so a dump
  # that fails halfway leaves the database exactly as it was. Dropping the whole schema
  # (rather than relying on the dump's own DROPs) also clears tables a newer version
  # added that the dump knows nothing about, which would otherwise block the drops.
  log "restoring database"
  { echo 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'; cat "$tmp/database.sql"; } |
    PGOPTIONS="-c client_min_messages=warning" psql -q -v ON_ERROR_STOP=1 --single-transaction -f - "$PGURL" > /dev/null ||
    die "database restore failed; the database is unchanged"

  # The directory may be a mount point, which cannot be swapped by rename, so its
  # contents are replaced. The database is already restored by now; if this fails,
  # the backup taken before the restore still has the old uploads.
  log "restoring uploads"
  mkdir -p "$UPLOADS"
  find "$UPLOADS" -mindepth 1 -maxdepth 1 -exec rm -rf {} + || die "could not clear $UPLOADS"
  cp -a "$tmp/uploads/." "$UPLOADS/" || die "could not copy uploads into $UPLOADS; the database IS restored"
  log "restore complete"
}

case "${1:-loop}" in
  once) archive > /dev/null ;;
  archive) archive ;;
  validate) validate "${2:?usage: backup.sh validate <file>}" ;;
  restore) restore "${2:?usage: backup.sh restore <file>}" ;;
  # `next` prints the wait and exits: how the schedule maths is checked without
  # waiting a day to find out it was wrong.
  next) seconds_until_hour ;;
  loop)
    # One backup on start so a fresh stack has something within seconds instead of
    # waiting until tomorrow morning, then daily at BACKUP_HOUR. A failed run is
    # logged and retried tomorrow rather than taking the container down.
    # In a subshell, because a failure exits: from the loop itself that would stop the
    # container, and its restart policy would then back up in a tight loop.
    (archive > /dev/null) || true
    while true; do
      delta=$(seconds_until_hour)
      log "next backup in ${delta}s"
      sleep "$delta"
      (archive > /dev/null) || true
    done
    ;;
  *) die "unknown command: $1" ;;
esac
