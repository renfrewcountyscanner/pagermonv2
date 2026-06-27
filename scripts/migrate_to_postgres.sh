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

# ── Export SQLite schema + data ─────────────────────────────────
log "Dumping SQLite database..."
sqlite3 "$SQLITE_DB" .dump > /tmp/pagermon_sqlite_dump.sql

# ── Transform SQLite SQL → PostgreSQL ──────────────────────────
log "Transforming SQL for PostgreSQL..."
sed -i \
  -e 's/INTEGER PRIMARY KEY AUTOINCREMENT/SERIAL PRIMARY KEY/g' \
  -e 's/PRAGMA foreign_keys=OFF;//g' \
  -e '/CREATE VIRTUAL TABLE.*messages_search_index/d' \
  -e '/INSERT INTO messages_search_index/d' \
  -e "/CREATE TRIGGER.*messages_search_index/d" \
  -e "/CREATE TRIGGER.*tr_log_messages/d" \
  -e '/CREATE INDEX.*messages_search_index/d' \
  -e "s/''/\\'/g" \
  /tmp/pagermon_sqlite_dump.sql

# ── Create a clean import file ──────────────────────────────────
cat > /tmp/pagermon_pg_import.sql << 'PGSQL'
BEGIN;
PGSQL

# Include the knex_migrations table creation (the dump has it)
# but strip the sqlite_sequence references and the search index stuff
grep -v 'sqlite_sequence\|sqlite_stat\|messages_search_index\|tr_log_messages' \
  /tmp/pagermon_sqlite_dump.sql >> /tmp/pagermon_pg_import.sql

echo 'COMMIT;' >> /tmp/pagermon_pg_import.sql

# ── Import into PostgreSQL ──────────────────────────────────────
log "Importing into PostgreSQL..."
_docker_compose exec -T postgres psql -U "$PG_USER" -d "$PG_DB" \
  < /tmp/pagermon_pg_import.sql 2>&1 | grep -v "^psql:" | head -5 || true

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
log "  messages:  $(docker compose exec -T postgres psql -U $PG_USER -d $PG_DB -tAc 'SELECT COUNT(*) FROM messages')"
log "  capcodes:  $(docker compose exec -T postgres psql -U $PG_USER -d $PG_DB -tAc 'SELECT COUNT(*) FROM capcodes')"
log "  users:     $(docker compose exec -T postgres psql -U $PG_USER -d $PG_DB -tAc 'SELECT COUNT(*) FROM users')"
log ""
log "Run the search index backfill on the pagermon container:"
log "  docker compose exec pagermon node -e \"require('./knex/knex.js').raw('UPDATE messages SET search_vector = to_tsvector(\\\"english\\\", coalesce(message,\\\"\\\") || \\\" \\\" || coalesce(source,\\\"\\\"))')\""
