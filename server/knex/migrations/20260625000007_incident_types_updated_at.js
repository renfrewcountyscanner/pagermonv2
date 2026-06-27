exports.up = function (db) {
  return db.schema.hasColumn('incident_types', 'updated_at').then(function (exists) {
    if (exists) return Promise.resolve('Not Required');
    return db.schema.table('incident_types', function (table) {
      table.integer('updated_at');
    });
  });
};

exports.down = function (db) {
  return db.schema.hasColumn('incident_types', 'updated_at').then(function (exists) {
    if (!exists) return Promise.resolve('Not Required');
    return db.schema.table('incident_types', function (table) {
      table.dropColumn('updated_at');
    });
  });
};
