var db = require('../knex/knex.js');
var logger = require('../log');
var pluginHandler = require('../plugins/pluginHandler');

var POLL_INTERVAL_MS = 2000;
var STALE_LOCK_SECONDS = 300;
var MAX_ATTEMPTS = 8;
var timer = null;
var processing = false;

function now() {
  return Math.floor(Date.now() / 1000);
}

function retryDelay(attempts) {
  return Math.min(Math.pow(2, Math.max(0, attempts - 1)) * 30, 3600);
}

function enqueue(message) {
  var timestamp = now();
  return db('plugin_outbox')
    .insert({
      message_id: message.id,
      trigger: 'message',
      scope: 'after',
      payload: JSON.stringify(message),
      status: 'pending',
      attempts: 0,
      available_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .catch(function (err) {
      // A retry of an already-enqueued message is safe.
      if (err && (err.code === '23505' || err.code === 'SQLITE_CONSTRAINT')) return null;
      throw err;
    });
}

function recoverStaleJobs() {
  var timestamp = now();
  return db('plugin_outbox')
    .where('status', 'processing')
    .where('locked_at', '<', timestamp - STALE_LOCK_SECONDS)
    .update({
      status: 'pending',
      available_at: timestamp,
      locked_at: null,
      updated_at: timestamp,
      last_error: 'Recovered after worker interruption',
    });
}

function claimNext() {
  var timestamp = now();
  return db('plugin_outbox')
    .whereIn('status', ['pending', 'retry'])
    .where('available_at', '<=', timestamp)
    .where('attempts', '<', MAX_ATTEMPTS)
    .orderBy('id', 'asc')
    .first()
    .then(function (job) {
      if (!job) return null;
      return db('plugin_outbox')
        .where('id', job.id)
        .whereIn('status', ['pending', 'retry'])
        .update({ status: 'processing', locked_at: timestamp, updated_at: timestamp })
        .then(function (updated) {
          return updated ? job : null;
        });
    });
}

function complete(job) {
  var timestamp = now();
  return db('plugin_outbox').where('id', job.id).update({
    status: 'completed',
    completed_at: timestamp,
    locked_at: null,
    updated_at: timestamp,
    last_error: null,
  });
}

function fail(job, err) {
  var attempts = job.attempts + 1;
  var timestamp = now();
  var exhausted = attempts >= MAX_ATTEMPTS;
  return db('plugin_outbox').where('id', job.id).update({
    status: exhausted ? 'failed' : 'retry',
    attempts: attempts,
    available_at: timestamp + retryDelay(attempts),
    locked_at: null,
    updated_at: timestamp,
    last_error: String(err && err.stack || err || 'Unknown plugin error').slice(0, 4000),
  });
}

function runJob(job) {
  var payload;
  try {
    payload = JSON.parse(job.payload);
  } catch (err) {
    return fail(job, err);
  }

  return new Promise(function (resolve, reject) {
    try {
      pluginHandler.handle(job.trigger, job.scope, payload, function () { resolve(); });
    } catch (err) {
      reject(err);
    }
  }).then(function () {
    return complete(job);
  }).catch(function (err) {
    logger.main.error('Plugin outbox job ' + job.id + ' failed: ' + err.message);
    return fail(job, err);
  });
}

function processSoon() {
  if (processing) return;
  processing = true;
  claimNext()
    .then(function (job) { return job ? runJob(job) : null; })
    .catch(function (err) { logger.main.error('Plugin outbox worker error: ' + err.message); })
    .finally(function () { processing = false; });
}

function start() {
  if (timer) return;
  recoverStaleJobs().catch(function (err) {
    logger.main.error('Plugin outbox recovery failed: ' + err.message);
  });
  timer = setInterval(processSoon, POLL_INTERVAL_MS);
  processSoon();
}

module.exports = { enqueue: enqueue, start: start, processSoon: processSoon, retryDelay: retryDelay };
