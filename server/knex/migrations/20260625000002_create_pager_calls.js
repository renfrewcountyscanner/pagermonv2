// Stores parsed + geocoded pager messages for the public map service.

exports.up = function (db) {
  return db.schema.hasTable('pager_calls').then(function (exists) {
    if (exists) return;
    return db.schema.createTable('pager_calls', function (table) {
      table.increments('call_id').primary();
      table.string('address', 512);
      table.string('cross_streets', 512);
      table.string('alias', 128);
      table.string('sent_by', 128);
      table.string('incident_type', 128);
      table.text('raw_text');
      table.string('message_timestamp', 16);
      table.float('lat');
      table.float('lng');
      table.string('formatted_address', 1024);
      table.string('geocode_city', 128);
      table.string('geocode_state', 8);
      table.string('geocode_county', 128);
      table.string('geocode_country', 4);
      table.string('geocode_source', 32);
      table.float('corrected_lat');
      table.float('corrected_lng');
      table.string('corrected_address', 1024);
      table.integer('created_at').notNullable();
      table.integer('processed').notNullable().defaultTo(0);
    }).then(function () {
      return db.schema.raw(
        'CREATE INDEX IF NOT EXISTS idx_pager_calls_time ON pager_calls(created_at DESC)'
      );
    }).then(function () {
      return db.schema.raw(
        'CREATE INDEX IF NOT EXISTS idx_pager_calls_sent_by ON pager_calls(sent_by)'
      );
    });
  });
};

exports.down = function (db) {
  return db.schema.dropTableIfExists('pager_calls');
};
