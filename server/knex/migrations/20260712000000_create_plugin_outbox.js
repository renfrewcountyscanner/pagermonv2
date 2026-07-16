// Persists post-message plugin work so accepted pages are not lost on restart.
exports.up = function (db) {
  return db.schema.hasTable('plugin_outbox').then(function (exists) {
    if (exists) return Promise.resolve('Not Required');
    return db.schema.createTable('plugin_outbox', function (table) {
      table.increments('id').primary();
      table.integer('message_id').notNullable().references('id').inTable('messages').onDelete('CASCADE');
      table.string('trigger', 32).notNullable().defaultTo('message');
      table.string('scope', 32).notNullable().defaultTo('after');
      table.text('payload').notNullable();
      table.string('status', 16).notNullable().defaultTo('pending');
      table.integer('attempts').notNullable().defaultTo(0);
      table.integer('available_at').notNullable();
      table.integer('locked_at');
      table.integer('completed_at');
      table.text('last_error');
      table.integer('created_at').notNullable();
      table.integer('updated_at').notNullable();
      table.unique(['message_id', 'trigger', 'scope'], 'plugin_outbox_message_scope_unique');
      table.index(['status', 'available_at'], 'plugin_outbox_ready_index');
    });
  });
};

exports.down = function (db) {
  return db.schema.dropTableIfExists('plugin_outbox');
};
