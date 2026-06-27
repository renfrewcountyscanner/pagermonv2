exports.up = function (db) {
  return db.schema.hasColumn('pager_calls', 'category').then(function (exists) {
    if (exists) return Promise.resolve('Not Required');
    return db.schema.table('pager_calls', function (table) {
      table.string('category', 64);
      table.string('color', 7);
      table.string('pin_letter', 3);
    });
  });
};

exports.down = function (db) {
  return db.schema.hasColumn('pager_calls', 'category').then(function (exists) {
    if (!exists) return Promise.resolve('Not Required');
    return db.schema.table('pager_calls', function (table) {
      table.dropColumn('pin_letter');
      table.dropColumn('color');
      table.dropColumn('category');
    });
  });
};
