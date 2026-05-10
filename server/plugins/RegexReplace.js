/*
Regex Replace
Allows matching and replacing
*/
var logger = require('../log');

function safeRegex(pattern) {
    try {
        return new RegExp(pattern);
    } catch (e) {
        logger.main.error('RegexReplace: Invalid regex pattern: ' + pattern + ' — ' + e.message);
        return null;
    }
}

function run(trigger, scope, data, config, callback) {
    if (config.regexReplaceMatchRegex) {
        var regex = safeRegex(config.regexReplaceMatchRegex);
        if (regex && data.message.match(regex)) {
            logger.main.info('RegexReplace: Found a match, replacing it');
            data.message = data.message.replace(regex, config.regexReplaceString);
            logger.main.debug('RegexReplace: Message has changed to: ' + data.message);
        }
    }
    callback(data);
}

module.exports = {
    run: run
}
