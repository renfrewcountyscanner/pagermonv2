var logger = require('./log');
var db = require('./knex/knex.js');

function init() {
    if (process.env.NODE_ENV !== 'test') {
        return db.migrate.currentVersion().then(function (result) {
            logger.main.info("Current DB version: " + result);
            logger.main.info('Checking for database upgrades');
            return db.migrate.latest();
        }).then(function (result) {
            if (result[0] === 1) {
                logger.main.info('Database upgrades complete');
            } else if (result[0] === 2) {
                logger.main.info('Database upgrade not required');
            }
        }).catch(function (err) {
            logger.main.error('Error upgrading database: ' + err);
        });
    }
    return Promise.resolve();
}

module.exports = {
    init: init
};
