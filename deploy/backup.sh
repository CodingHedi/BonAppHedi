#!/bin/bash
#
# Nightly SQLite backup. Installed to /usr/local/bin/bonapphedi-backup by
# provision.sh and run by bonapphedi-backup.timer.
#
# Uses `sqlite3 .backup` rather than copying the file. A plain cp of a live
# SQLite database can capture a torn write - the copy looks fine, restores
# fine, and is missing or corrupting whatever was in flight. `.backup` takes a
# read lock and produces a consistent snapshot of a database that is being
# written to.

set -euo pipefail

DB=/var/lib/bonapphedi/bonapphedi.db
DEST=/var/backups/bonapphedi
KEEP_DAYS=30

[[ -f "$DB" ]] || { echo "no database at $DB yet; nothing to back up"; exit 0; }

mkdir -p "$DEST"
STAMP=$(date +%Y-%m-%d)
OUT="$DEST/bonapphedi-$STAMP.db"

sqlite3 "$DB" ".backup '$OUT'"

# An integrity check on the copy, not the original: a backup nobody has ever
# opened is a hope rather than a backup, and this is the cheapest possible way
# to find out it is unreadable now instead of on the day it is needed.
if ! sqlite3 "$OUT" 'PRAGMA integrity_check;' | grep -q '^ok$'; then
  echo "integrity check FAILED for $OUT" >&2
  exit 1
fi

gzip -f "$OUT"
chmod 600 "$OUT.gz"

find "$DEST" -name 'bonapphedi-*.db.gz' -mtime +"$KEEP_DAYS" -delete

echo "backed up to $OUT.gz ($(du -h "$OUT.gz" | cut -f1)), keeping $KEEP_DAYS days"

# Worth saying plainly: this writes to the same disk as the database, so it
# survives a mistake but not a dead VPS. Copying $DEST somewhere else - another
# host, object storage, a laptop - is a separate decision and is not made here.
