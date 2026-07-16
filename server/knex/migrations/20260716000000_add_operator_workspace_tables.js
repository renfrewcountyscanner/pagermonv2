exports.up = function (db) {
  return db.schema.hasColumn('messages', 'pager_call_id').then(function (hasCallId) {
    var messageMigration = hasCallId ? Promise.resolve() : db.schema.table('messages', function (table) {
      table.integer('pager_call_id').unsigned().references('call_id').inTable('pager_calls');
      table.index('pager_call_id', 'messages_pager_call_id_index');
    });

    return messageMigration.then(function () {
      return db.schema.hasTable('user_saved_views').then(function (exists) {
        if (exists) return Promise.resolve();
        return db.schema.createTable('user_saved_views', function (table) {
          table.increments('id').primary();
          table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
          table.string('view_type', 32).notNullable().defaultTo('messages');
          table.string('name', 80).notNullable();
          table.text('state').notNullable();
          table.integer('created_at').notNullable();
          table.integer('updated_at').notNullable();
          table.unique(['user_id', 'view_type', 'name'], 'user_saved_views_user_name_unique');
          table.index(['user_id', 'view_type'], 'user_saved_views_lookup_index');
        });
      });
    });
  });
};

exports.down = function (db) {
  return db.schema.dropTableIfExists('user_saved_views').then(function () {
    return db.schema.hasColumn('messages', 'pager_call_id').then(function (exists) {
      if (!exists) return Promise.resolve();
      return db.schema.table('messages', function (table) {
        table.dropIndex('pager_call_id', 'messages_pager_call_id_index');
        table.dropColumn('pager_call_id');
      });
    });
  });
};
