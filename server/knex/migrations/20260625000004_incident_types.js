exports.up = function (db) {
  return db.schema.hasTable('incident_types').then(function (exists) {
    if (exists) return;
    return db.schema.createTable('incident_types', function (table) {
      table.increments('id').primary();
      table.string('name', 128).notNullable().unique();
      table.string('display_name', 128);
      table.string('category', 64);
      table.string('color', 7).defaultTo('#6c757d');
      table.string('pin_letter', 3).defaultTo('O');
      table.integer('active').notNullable().defaultTo(1);
      table.integer('created_at').notNullable();
    }).then(function () {
      return db.schema.raw(
        'CREATE INDEX IF NOT EXISTS idx_incident_types_category ON incident_types (category)'
      );
    }).then(function () {
      return db.schema.raw(
        'CREATE INDEX IF NOT EXISTS idx_incident_types_active ON incident_types (active)'
      );
    });
  });
};

exports.down = function (db) {
  return db.schema.dropTableIfExists('incident_types');
};
