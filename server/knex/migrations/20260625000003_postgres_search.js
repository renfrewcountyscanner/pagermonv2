// PostgreSQL full-text search for the messages table.
// Replaces SQLite FTS3 virtual table with PostgreSQL tsvector + GIN.

exports.up = function (db) {
  var nconf = require('nconf');
  nconf.file({ file: './config/config.json' });
  nconf.load();
  if (nconf.get('database:type') !== 'pg') return Promise.resolve('Skipped — not PostgreSQL');

  return db.schema.hasColumn('messages', 'search_vector').then(function (exists) {
    if (exists) return;
    return db.schema.raw(
      'ALTER TABLE messages ADD COLUMN search_vector tsvector'
    ).then(function () {
      return db.schema.raw(
        "UPDATE messages SET search_vector = to_tsvector('english', coalesce(message, '') || ' ' || coalesce(address, '') || ' ' || coalesce(source, ''))"
      );
    }).then(function () {
      return db.schema.raw(
        'CREATE INDEX IF NOT EXISTS messages_search_idx ON messages USING GIN (search_vector)'
      );
    }).then(function () {
      return db.schema.raw(`
        CREATE OR REPLACE FUNCTION update_message_search_vector()
        RETURNS trigger AS $$
        BEGIN
          NEW.search_vector := to_tsvector('english', coalesce(NEW.message, '') || ' ' || coalesce(NEW.address, '') || ' ' || coalesce(NEW.source, ''));
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);
    }).then(function () {
      return db.schema.raw(
        'DROP TRIGGER IF EXISTS trg_messages_search ON messages'
      );
    }).then(function () {
      return db.schema.raw(`
        CREATE TRIGGER trg_messages_search
        BEFORE INSERT OR UPDATE ON messages
        FOR EACH ROW EXECUTE FUNCTION update_message_search_vector()
      `);
    });
  });
};

exports.down = function (db) {
  var nconf = require('nconf');
  nconf.file({ file: './config/config.json' });
  nconf.load();
  if (nconf.get('database:type') !== 'pg') return Promise.resolve('Skipped — not PostgreSQL');

  return db.schema.raw('DROP TRIGGER IF EXISTS trg_messages_search ON messages').then(function () {
    return db.schema.raw('DROP FUNCTION IF EXISTS update_message_search_vector()');
  }).then(function () {
    return db.schema.raw('DROP INDEX IF EXISTS messages_search_idx');
  }).then(function () {
    return db.schema.hasColumn('messages', 'search_vector');
  }).then(function (exists) {
    if (!exists) return;
    return db.schema.raw('ALTER TABLE messages DROP COLUMN search_vector');
  });
};
