#!/bin/sh
set -e

# =============================================================================
# PagerMon — Docker Entrypoint
# =============================================================================
# Handles first-run configuration, database migrations, and seeding.

CONFIG_DIR="/config"
APP_DIR="/app"
CONFIG_FILE="$CONFIG_DIR/config.json"
DEFAULTS_FILE="$APP_DIR/config/default.json"

# ── First run: copy default config to persistent volume ─────────
if [ ! -f "$CONFIG_FILE" ]; then
  echo "[entrypoint] First run — initializing config..."
  mkdir -p "$CONFIG_DIR"
  cp "$DEFAULTS_FILE" "$CONFIG_FILE"
  ln -sf "$CONFIG_FILE" "$APP_DIR/config/config.json"
  ln -sf "$CONFIG_DIR/backup.json" "$APP_DIR/config/backup.json" 2>/dev/null || true
  # Generate random session secret on first run
  node -e "
    var crypto = require('crypto');
    var nconf = require('nconf');
    nconf.file({ file: '$CONFIG_FILE' });
    nconf.load();
    nconf.set('global:sessionSecret', crypto.randomBytes(32).toString('hex'));
    nconf.save(function() { console.log('[entrypoint] Session secret generated'); });
  "
else
  ln -sf "$CONFIG_FILE" "$APP_DIR/config/config.json"
  ln -sf "$CONFIG_DIR/backup.json" "$APP_DIR/config/backup.json" 2>/dev/null || true
  # Ensure sessionSecret is set on existing configs too
  node -e "
    var crypto = require('crypto');
    var nconf = require('nconf');
    nconf.file({ file: '$CONFIG_FILE' });
    nconf.load();
    var secret = nconf.get('global:sessionSecret');
    if (!secret || secret === 'REPLACE_ME_ON_FIRST_RUN') {
      nconf.set('global:sessionSecret', crypto.randomBytes(32).toString('hex'));
      nconf.save(function() { console.log('[entrypoint] Session secret regenerated for existing config'); });
    }
  "
fi

# ── Ensure database type is pg (belt-and-suspenders) ────────────
# Environment variables from docker-compose override nconf at runtime,
# but we also patch the file so admin UI shows correct DB type.
if command -v node >/dev/null 2>&1; then
  node -e "
    var nconf = require('nconf');
    nconf.file({ file: '$CONFIG_FILE' });
    nconf.load();
    var changed = false;
    if (nconf.get('database:type') !== 'pg') { nconf.set('database:type', 'pg'); changed = true; }
    if (!nconf.get('database:server')) { nconf.set('database:server', 'postgres'); changed = true; }
    if (!nconf.get('database:port')) { nconf.set('database:port', 5432); changed = true; }
    if (!nconf.get('database:database')) { nconf.set('database:database', process.env.DATABASE__DATABASE || 'pagermon'); changed = true; }
    if (!nconf.get('database:username')) { nconf.set('database:username', process.env.DATABASE__USERNAME || 'pagermon'); changed = true; }
    if (!nconf.get('database:password')) { nconf.set('database:password', process.env.DATABASE__PASSWORD || ''); changed = true; }
    if (!nconf.get('publicmap:apikey')) { nconf.set('publicmap:apikey', process.env.PUBLICMAP__APIKEY || ''); changed = true; }
    if (changed) { nconf.save(function(err) { if (err) console.error('[entrypoint] Failed to save config:', err); }); }
  "
fi

# ── Wait for PostgreSQL ─────────────────────────────────────────
echo "[entrypoint] Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if node -e "
    var { Client } = require('pg');
    var c = new Client({
      host: process.env.DATABASE__SERVER || 'postgres',
      port: process.env.DATABASE__PORT || 5432,
      database: process.env.DATABASE__DATABASE || 'pagermon',
      user: process.env.DATABASE__USERNAME || 'pagermon',
      password: process.env.DATABASE__PASSWORD || '',
      connectionTimeoutMillis: 3000
    });
    c.connect().then(function() { c.end(); process.exit(0); }).catch(function() { process.exit(1); });
  " 2>/dev/null; then
    echo "[entrypoint] PostgreSQL is ready."
    break
  fi
  sleep 2
done

# ── Run database migrations ─────────────────────────────────────
echo "[entrypoint] Running database migrations..."
node -e "
  var db = require('./knex/knex.js');
  db.migrate.latest().then(function(result) {
    var msg = result[0] === 1 ? 'Migrations complete' : 'Already up-to-date';
    console.log('[entrypoint] ' + msg);
    process.exit(0);
  }).catch(function(err) {
    console.error('[entrypoint] Migration error:', err.message);
    process.exit(1);
  });
"

# ── ─────────────────────────────────────────────────────────
echo "[entrypoint] Starting PagerMon..."
echo "[entrypoint] Configure location context at: Admin → Location Config"
echo "[entrypoint] Configure call types at: Admin → Call Types → Scan for New Types"

exec node app.js
