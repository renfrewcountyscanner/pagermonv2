const axios = require('axios').default;
var logger = require('../log');

function run(trigger, scope, data, config, callback) {
  let pConf = data.pluginconf.Ntfy;

  // Conditions for sending:
  // - alias-level enable is on, OR
  // - global filterMode is "2" (send all messages), OR
  // - global filterMode is "1" (send defined aliases) and this message has an alias
  if ((pConf && pConf.enable) || (config.filterMode && config.filterMode.value === '2') || (config.filterMode && config.filterMode.value === '1' && data.alias_id)) {
    if (!config.topic) {
      logger.main.error('Ntfy: No topic configured');
      callback(data);
      return;
    }

    const serverUrl = (config.serverUrl || 'https://ntfy.sh').replace(/\/$/, '');
    const url = `${serverUrl}/${config.topic}`;

    // Build notification body and title
    const body = data.message || 'No message';
    let title = config.title || 'PagerMon Alert';

    // Simple template substitution
    title = title
      .replace(/{alias}/g, data.alias || 'Unknown')
      .replace(/{message}/g, data.message || '')
      .replace(/{address}/g, data.address || '')
      .replace(/{agency}/g, data.agency || '');

    const headers = {
      'Title': title,
      'Priority': String(config.priority || 3),
      'User-Agent': 'PagerMon - Ntfy Plugin'
    };

    if (config.tags) {
      headers['Tags'] = config.tags;
    }

    if (config.accessToken) {
      headers['Authorization'] = `Bearer ${config.accessToken}`;
    }

    logger.main.debug('Ntfy: Sending to ' + url + ' — ' + title);

    axios.post(url, body, {
      headers: headers,
      timeout: 10000 // 10s timeout
    }).then(() => {
      logger.main.info('Ntfy: Message sent successfully');
    }).catch(error => {
      if (error.response) {
        logger.main.error('Ntfy: HTTP ' + error.response.status + ' — ' + JSON.stringify(error.response.data));
      } else if (error.request) {
        logger.main.error('Ntfy: No response from server');
      } else {
        logger.main.error('Ntfy: ' + error.message);
      }
    });

    callback(data);
  } else {
    callback(data);
  }
}

module.exports = {
  run: run
};
