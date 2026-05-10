const axios = require('axios').default;
const logger = require('../log');
const { isDuplicate } = require('./lib/messageDedup');

function buildPayload(data, config) {
  if (config.mode === 'generic' && config.genericPayloadTemplate) {
    let body = config.genericPayloadTemplate;
    for (const [field, value] of Object.entries(data)) {
      body = body.replace(new RegExp(`\\{${field}\\}`, 'g'), value != null ? String(value) : '');
    }
    return body;
  }
  return JSON.stringify(data);
}

function buildHeaders(config) {
  const headers = { 'Content-Type': 'application/json' };
  if (config.mode === 'generic' && config.genericHeaders) {
    try {
      Object.assign(headers, JSON.parse(config.genericHeaders));
    } catch (e) {
      logger.main.error('Webhook: Invalid genericHeaders JSON: ' + e.message);
    }
  } else if (config.authToken) {
    headers['Authorization'] = config.authToken;
  }
  return headers;
}

function run(trigger, scope, data, config, callback) {
  if (!config.enable || !config.webhookURL) {
    return callback(data);
  }

  if (isDuplicate(data.message)) {
    return callback(data);
  }

  const payload = buildPayload(data, config);
  const headers = buildHeaders(config);

  logger.main.debug('Webhook: Forwarding to ' + config.webhookURL);

  axios.post(config.webhookURL, payload, { headers, timeout: 8000 })
    .then(() => { logger.main.info('Webhook: Message forwarded successfully'); })
    .catch(error => {
      if (error.response) {
        logger.main.error('Webhook: HTTP ' + error.response.status + ' — ' + JSON.stringify(error.response.data));
      } else if (error.request) {
        logger.main.error('Webhook: No response from webhook: ' + error.message);
      } else {
        logger.main.error('Webhook: Request error: ' + error.message);
      }
    });

  callback(data);
}

module.exports = { run };
