// Maps (sent_by, alias_pattern) to a geographic location context
// used by the Geocoder plugin to bias Nominatim address lookups.

exports.up = function (db) {
  return db.schema.hasTable('agency_location_config').then(function (exists) {
    if (exists) return;
    return db.schema.createTable('agency_location_config', function (table) {
      table.increments('id').primary();
      table.string('sent_by', 128).notNullable();
      table.string('alias_pattern', 128).nullable();
      table.string('city', 128);
      table.string('county', 128);
      table.string('state', 8);
      table.string('country', 4);
      table.float('fallback_lat');
      table.float('fallback_lng');
      table.float('bounds_min_lat');
      table.float('bounds_min_lng');
      table.float('bounds_max_lat');
      table.float('bounds_max_lng');
      table.integer('active').notNullable().defaultTo(1);
      table.integer('priority').notNullable().defaultTo(5);
      table.timestamp('created_at').defaultTo(db.fn.now());
    }).then(function () {
      return db.schema.raw(
        'CREATE INDEX IF NOT EXISTS idx_agency_config_lookup ' +
        'ON agency_location_config (sent_by, alias_pattern)'
      );
    });
  });
};

exports.down = function (db) {
  return db.schema.dropTableIfExists('agency_location_config');
};
