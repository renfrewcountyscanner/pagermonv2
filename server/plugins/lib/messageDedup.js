// Shared deduplication buffer — keyed by normalized message text.
// Because Node.js caches require(), all plugins share the same Map instance.
const nconf = require('nconf');
const logger = require('../../log');

const dedupBuffer = new Map();

function purgeExpired(windowMs) {
  const cutoff = Date.now() - windowMs;
  for (const [key, ts] of dedupBuffer) {
    if (ts < cutoff) dedupBuffer.delete(key);
  }
}

/**
 * Returns true if this message text was already seen within the dedup window.
 * Reads window from global config: messages:deduplication:windowMinutes
 * If deduplication is disabled globally, always returns false.
 */
function isDuplicate(messageText) {
  nconf.load();
  if (!nconf.get('messages:deduplication:enable')) return false;

  const windowMs = (parseInt(nconf.get('messages:deduplication:windowMinutes'), 10) || 15) * 60 * 1000;
  purgeExpired(windowMs);

  const key = (messageText || '').trim().toLowerCase();
  if (!key) return false;

  if (dedupBuffer.has(key)) {
    logger.main.info('MessageDedup: duplicate suppressed within window');
    return true;
  }

  dedupBuffer.set(key, Date.now());
  return false;
}

module.exports = { isDuplicate };
