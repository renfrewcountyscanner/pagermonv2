var logger = require('../log');

function safeMatch(text, pattern) {
    try {
        return text.match(new RegExp(pattern));
    } catch (e) {
        logger.main.error('Filter: Invalid regex pattern: ' + pattern + ' — ' + e.message);
        return null;
    }
}

function run(trigger, scope, data, config, callback) {
    if (config.ignoreallbutAddress) {
        if (!safeMatch(data.address, config.ignoreallbutAddress)) {
            data.pluginData.ignore = true;
            logger.main.info('Filter: ignoring message due to no regex match on address');
        }
    }
    if (config.ignoreallbutMessage) {
        if (!safeMatch(data.message, config.ignoreallbutMessage)) {
            data.pluginData.ignore = true;
            logger.main.info('Filter: ignoring message due to no regex match on message');
        }
    }
    if (config.ignoreAddress) {
        if (safeMatch(data.address, config.ignoreAddress)) {
            data.pluginData.ignore = true;
            logger.main.info('Filter: ignoring message due to regex match on address');
        }
    }
    if (config.ignoreMessage) {
        if (safeMatch(data.message, config.ignoreMessage)) {
            data.pluginData.ignore = true;
            logger.main.info('Filter: ignoring message due to regex match on content');
        }
    }
    callback(data);
}

module.exports = {
    run: run
}
