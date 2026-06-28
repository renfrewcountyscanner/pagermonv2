#!/bin/bash
set -e

# =============================================================================
# PagerMon — SQLite to PostgreSQL Data Migration
# =============================================================================
# Exports an existing SQLite messages.db and imports into the running
# PostgreSQL container. Called automatically by install.sh when
# MIGRATE_SQLITE=1 is set, or can be run manually.
#
# Usage:  bash scripts/migrate_to_postgres.sh [/path/to/messages.db]
# =============================================================================

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $1"; }
die()  { echo -e "${RED}[X]${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SQLITE_DB="${1:-$PROJECT_DIR/server/messages.db}"
PG_CONTAINER="${PG_CONTAINER:-pagermon-postgres}"
PG_USER="${PG_USER:-pagermon}"
PG_DB="${PG_DATABASE:-pagermon}"

_docker_compose() {
  if docker compose version &>/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

# ── Check prerequisites ─────────────────────────────────────────
if [ ! -f "$SQLITE_DB" ]; then
  die "SQLite database not found at: $SQLITE_DB"
fi

if ! _docker_compose ps postgres 2>/dev/null | grep -q "Up"; then
  die "PostgreSQL container is not running. Start with: docker compose up -d"
fi

log "Migrating $SQLITE_DB → PostgreSQL container '$PG_CONTAINER'..."

# ── Write Python export helper ──────────────────────────────────
cat > /tmp/_pm_export.py << 'PYEOF'
import sqlite3, sys, os

db_path = sys.argv[1]
conn = sqlite3.connect(db_path)
cur = conn.cursor()

def esc(v):
    if v is None: return 'NULL'
    if isinstance(v, (int, float)): return str(v)
    s = str(v).replace('\\', '\\\\').replace("'", "''")
    return "'%s'" % s

print("BEGIN;")

# Clear default admin so old credentials import cleanly
print("DELETE FROM users WHERE username = 'admin';")
print("DELETE FROM capcodes;")
print("DELETE FROM messages;")

# capcodes — insert without match_type (PG default handles it)
cur.execute("SELECT id, address, alias, agency, icon, color, pluginconf, ignore FROM capcodes ORDER BY id")
for row in cur:
    vals = ', '.join(esc(c) for c in row)
    print("INSERT INTO capcodes (id, address, alias, agency, icon, color, pluginconf, ignore) VALUES(%s);" % vals)

# messages — insert without search_vector (PG FTS trigger fills it)
cur.execute("SELECT id, address, message, source, timestamp, alias_id FROM messages ORDER BY id")
for row in cur:
    vals = ', '.join(esc(c) for c in row)
    print("INSERT INTO messages (id, address, message, source, timestamp, alias_id) VALUES(%s);" % vals)

# users — import old creds (default admin already cleared above)
cur.execute("SELECT id, givenname, surname, username, password, email, role, status, lastlogondate FROM users ORDER BY id")
for row in cur:
    vals = ', '.join(esc(c) for c in row)
    print("INSERT INTO users (id, givenname, surname, username, password, email, role, status, lastlogondate) VALUES(%s);" % vals)

print("COMMIT;")
conn.close()
PYEOF
log "Exporting data..."
python3 /tmp/_pm_export.py "$SQLITE_DB" > /tmp/pagermon_pg_import.sql
log "Importing into PostgreSQL..."
_IMPORT_OUT="$(_docker_compose exec -T postgres psql -U "$PG_USER" -d "$PG_DB" \
  < /tmp/pagermon_pg_import.sql 2>&1)" || true
_IMPORT_ERRS=$(echo "$_IMPORT_OUT" | grep -iE "ERROR[^_]" | grep -v "pg_isready\|search_vector\|does not exist" | head -20)
if [ -n "$_IMPORT_ERRS" ]; then
  die "Import errors:\n$_IMPORT_ERRS"
fi

# ── Fix sequences ───────────────────────────────────────────────
log "Resetting sequences..."
_docker_compose exec -T postgres psql -U "$PG_USER" -d "$PG_DB" <<'EOSQL'
SELECT setval('capcodes_id_seq', COALESCE((SELECT MAX(id) FROM capcodes), 1));
SELECT setval('messages_id_seq', COALESCE((SELECT MAX(id) FROM messages), 1));
SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 1));
EOSQL

# ── Backup the original ─────────────────────────────────────────
mv "$SQLITE_DB" "${SQLITE_DB}.bak"
log "Original SQLite database backed up to: ${SQLITE_DB}.bak"

# ── Done ────────────────────────────────────────────────────────
log ""
log "Migration complete!"
log "  messages:  $(_docker_compose exec -T postgres psql -U $PG_USER -d $PG_DB -tAc 'SELECT COUNT(*) FROM messages' 2>/dev/null || echo '?')"
log "  capcodes:  $(_docker_compose exec -T postgres psql -U $PG_USER -d $PG_DB -tAc 'SELECT COUNT(*) FROM capcodes' 2>/dev/null || echo '?')"
log "  users:     $(_docker_compose exec -T postgres psql -U $PG_USER -d $PG_DB -tAc 'SELECT COUNT(*) FROM users' 2>/dev/null || echo '?')"
log ""
log "Run the search index backfill on the pagermon container:"
log "  docker compose exec pagermon node -e \"require('./knex/knex.js').raw('UPDATE messages SET search_vector = to_tsvector(\\\"english\\\", coalesce(message,\\\"\\\") || \\\" \\\" || coalesce(source,\\\"\\\"))')\""
