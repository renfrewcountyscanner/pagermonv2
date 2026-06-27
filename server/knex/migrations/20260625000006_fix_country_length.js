exports.up = function (db) {
  return db.schema.raw("ALTER TABLE pager_calls ALTER COLUMN geocode_country TYPE varchar(64)");
};

exports.down = function (db) {
  return db.schema.raw("ALTER TABLE pager_calls ALTER COLUMN geocode_country TYPE varchar(4)");
};
