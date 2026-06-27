var nconf = require('nconf');
var logger = require('./log');

nconf.env({
    separator: '__',
    lowerCase: true,
    parseValues: true
});
nconf.file({ file: './config/config.json' });
nconf.load();

var dbconfig = {
    client: 'pg',
    connection: {
      host: process.env.DATABASE__SERVER || nconf.get('database:server') || 'postgres',
      port: process.env.DATABASE__PORT || nconf.get('database:port') || 5432,
      database: process.env.DATABASE__DATABASE || nconf.get('database:database') || 'pagermon',
      user: process.env.DATABASE__USERNAME || nconf.get('database:username') || 'pagermon',
      password: process.env.DATABASE__PASSWORD || nconf.get('database:password') || '',
    },
    debug: nconf.get('global:loglevel') === 'debug',
    migrations: {
      tableName: 'knex_migrations',
      directory: __dirname + '/knex/migrations'
    },
    log: {
      warn(message) { logger.db.info(JSON.stringify(message)) },
      error(message) { logger.db.error(JSON.stringify(message)) },
      deprecate(message) { logger.db.info(JSON.stringify(message)) },
      debug(message) { logger.db.debug(JSON.stringify(message)) },
    }
};

module.exports = dbconfig;
module.exports.test = dbconfig;
module.exports.development = dbconfig;
module.exports.staging = dbconfig;
module.exports.production = dbconfig;
