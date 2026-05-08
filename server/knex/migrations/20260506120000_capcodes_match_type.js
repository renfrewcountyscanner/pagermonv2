// Adds match_type to capcodes so an alias can match either by capcode address
// (default) or by the API-key name the page was posted with.

exports.up = function (db, Promise) {
  return db.schema.hasColumn('capcodes', 'match_type').then(function (exists) {
    if (exists) return Promise.resolve('Not Required');
    return db.schema.table('capcodes', function (table) {
      table.string('match_type', 16).notNullable().defaultTo('address');
    });
  });
};

exports.down = function (db, Promise) {
  return db.schema.hasColumn('capcodes', 'match_type').then(function (exists) {
    if (!exists) return Promise.resolve('Not Required');
    return db.schema.table('capcodes', function (table) {
      table.dropColumn('match_type');
    });
  });
};
