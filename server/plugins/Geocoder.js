var axios = require('axios').default;
var logger = require('../log');
var db = require('../knex/knex.js');
var nconf = require('nconf');
var NominatimClient = require('../lib/nominatim');

var confFile = './config/config.json';
nconf.file({ file: confFile });
nconf.env({
    separator: '__',
    lowerCase: true,
    parseValues: true
});
nconf.load();

var _nominatim = null;
var _nominatimUrl = '';
function getNominatimClient(config) {
  var url = config.nominatimUrl || 'https://nominatim.openstreetmap.org/search';
  if (_nominatim && _nominatimUrl === url) return _nominatim;
  _nominatimUrl = url;
  _nominatim = new NominatimClient({
    baseUrl: url,
    userAgent: config.userAgent || 'PagerMon/1.0',
    rateLimitMs: parseInt(config.rateLimitMs, 10) || 1100,
    bulkMode: !!config.bulkMode,
  });
  return _nominatim;
}

function parseOttawaMessage(text) {
  var result = { address: '', cross_streets: '', alias: '', sent_by: '', incident_type: '', timestamp: '' };
  var lines = text.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    var timeAddrMatch = line.match(/^(\d{2}:\d{2}:\d{2})\s+(.+)/);
    if (timeAddrMatch) {
      result.timestamp = timeAddrMatch[1];
      result.address = timeAddrMatch[2];
      continue;
    }

    if (line.indexOf('Gd:') >= 0 || line.indexOf('Alias:') >= 0) {
      var aliasMatch = line.match(/Alias:(\S+)/);
      if (aliasMatch) result.alias = aliasMatch[1];
      var gdMatch = line.match(/Gd:\s*(.+?)(?:\/Alias:|$)/);
      if (gdMatch) result.cross_streets = gdMatch[1].trim();
      continue;
    }

    if (line.toLowerCase().indexOf('sent by:') === 0) {
      result.sent_by = line.split(':').slice(1).join(':').trim();
      continue;
    }

    if (result.incident_type === '' && line.indexOf('ALARM-') === 0) {
      result.incident_type = line;
    }
  }
  if (result.timestamp && !result.incident_type) {
    result.incident_type = lines[0].trim();
  }
  return result;
}

function parsePeelMessage(text) {
  var result = { address: '', cross_streets: '', alias: '', sent_by: '', incident_type: '', timestamp: '' };
  var line = text.trim();
  var locMatch = line.match(/LOC:(.+?)(?:\s+UNS:|\s+$)/);
  if (locMatch) result.address = locMatch[1].trim();
  var typMatch = line.match(/TYP:(\S+)/);
  if (typMatch) result.incident_type = typMatch[1];
  var incMatch = line.match(/INC:(\S+)/);
  if (incMatch) result.timestamp = incMatch[1];
  return result;
}

function parseMessage(text) {
  if (text.indexOf('\n') >= 0 && text.indexOf('Sent by:') >= 0) {
    return parseOttawaMessage(text);
  }
  if (text.indexOf('INC:') === 0) {
    return parsePeelMessage(text);
  }
  return parseOttawaMessage(text);
}

function getLocationContext(sentBy, alias) {
  nconf.load();

  return db('agency_location_config')
    .select('*')
    .where('active', 1)
    .where('sent_by', sentBy)
    .where('alias_pattern', alias || null)
    .orderBy('priority', 'desc')
    .limit(1)
    .then(function (rows) {
      if (rows.length > 0) return rows[0];
      return db('agency_location_config')
        .select('*')
        .where('active', 1)
        .where('sent_by', sentBy)
        .whereNull('alias_pattern')
        .orderBy('priority', 'desc')
        .limit(1)
        .then(function (fallbackRows) {
          return fallbackRows.length > 0 ? fallbackRows[0] : null;
        });
    });
}

function hasBounds(locationCtx) {
  return locationCtx && locationCtx.bounds_min_lat && locationCtx.bounds_max_lat;
}

function isWithinBounds(lat, lng, locationCtx) {
  if (!hasBounds(locationCtx)) return true;
  return lat >= locationCtx.bounds_min_lat && lat <= locationCtx.bounds_max_lat &&
         lng >= locationCtx.bounds_min_lng && lng <= locationCtx.bounds_max_lng;
}

function geocodeNominatim(address, locationCtx, config) {
  var client = getNominatimClient(config);
  var city = (locationCtx && locationCtx.city) || '';
  var state = (locationCtx && locationCtx.state) || '';
  var country = (locationCtx && locationCtx.country) || 'CA';

  var queries = [];
  if (city && state) queries.push(address + ', ' + city + ', ' + state + ', ' + country);
  if (state) queries.push(address + ', ' + state + ', ' + country);
  queries.push(address + ', ' + country);
  queries.push(address);

  var options = {};
  if (hasBounds(locationCtx)) {
    options.viewbox =
      locationCtx.bounds_min_lng + ',' +
      locationCtx.bounds_max_lat + ',' +
      locationCtx.bounds_max_lng + ',' +
      locationCtx.bounds_min_lat;
    options.bounded = 1;
  }

  function tryQuery(idx, withBounds) {
    if (idx >= queries.length) {
      // If bounds failed, retry all queries without bounds
      if (withBounds && hasBounds(locationCtx)) {
        logger.main.debug('Geocoder: Bounds search exhausted, retrying without bounds');
        return tryQuery(0, false);
      }
      // Fallback coordinates
      if (locationCtx && locationCtx.fallback_lat && locationCtx.fallback_lng) {
        return Promise.resolve({
          lat: locationCtx.fallback_lat, lng: locationCtx.fallback_lng,
          formatted_address: address + ', ' + city + ', ' + state + ', ' + country,
          city: city, county: locationCtx.county || '', state: state, country: country,
          source: 'fallback',
        });
      }
      return Promise.resolve(null);
    }

    var opts = Object.assign({}, options);
    if (!withBounds) { delete opts.viewbox; delete opts.bounded; }

    return client.geocode(queries[idx], country, opts).then(function (data) {
      if (data && data.length > 0) {
        var best = data[0];
        var lat = parseFloat(best.lat);
        var lng = parseFloat(best.lon);
        if (hasBounds(locationCtx) && !isWithinBounds(lat, lng, locationCtx)) {
          logger.main.debug('Geocoder: Result outside bounds for "' + queries[idx] + '" (' + lat + ',' + lng + '), trying next query');
          return tryQuery(idx + 1, withBounds);
        }
        var addr = best.address || {};
        return {
          lat: lat, lng: lng,
          formatted_address: best.display_name || queries[idx],
          city: addr.city || addr.town || addr.village || '',
          county: addr.county || '',
          state: addr.state || '',
          country: addr.country || '',
          source: 'nominatim',
        };
      }
      return tryQuery(idx + 1, withBounds);
    });
  }

  return tryQuery(0, hasBounds(locationCtx));
}

function pushToMap(callData, config) {
  var pushUrl = config.mapPushUrl;
  var apiKey = config.mapApiKey;
  if (!pushUrl || !apiKey) {
    logger.main.debug('Geocoder: Map push not configured, skipping');
    return;
  }

  axios.post(pushUrl, {
    calls: [callData],
  }, {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    timeout: 8000,
  })
    .then(function () {
      logger.main.info('Geocoder: Pushed call ' + callData.call_id + ' to map service');
    })
    .catch(function (err) {
      logger.main.error('Geocoder: Push failed: ' + err.message);
    });
}

function insertPagerCall(parsed, geoResult, typeInfo, config, messageText, msgTimestamp, pushData) {
  var isRetrigger = !!(pushData.pluginData && pushData.pluginData.retrigger);
  var dedupEnabled = config.dedupEnable !== false && !isRetrigger && geoResult !== null;
  var dedupWindow = parseInt(config.dedupWindowMinutes, 10) || 15;
  var checkPromise = dedupEnabled
    ? db('pager_calls')
        .select('call_id')
        .where('address', parsed.address)
        .where('created_at', '>', msgTimestamp - (dedupWindow * 60))
        .limit(1)
    : Promise.resolve([]);

  return checkPromise.then(function (existing) {
    if (existing.length > 0) {
      logger.main.info('Geocoder: Skipping duplicate at ' + parsed.address);
      return;
    }

    var cat = (typeInfo && typeInfo.category) || 'Other';
    var col = (typeInfo && typeInfo.color) || '#6c757d';
    var letr = (typeInfo && typeInfo.pin_letter) || 'O';

    return db('pager_calls').insert({
      address: parsed.address || '',
      cross_streets: parsed.cross_streets || '',
      alias: parsed.alias || '',
      sent_by: parsed.sent_by || '',
      incident_type: parsed.incident_type || '',
      raw_text: messageText,
      message_timestamp: parsed.timestamp || '',
      lat: geoResult ? geoResult.lat : null,
      lng: geoResult ? geoResult.lng : null,
      formatted_address: geoResult ? (geoResult.formatted_address || '') : '',
      geocode_city: geoResult ? (geoResult.city || '') : '',
      geocode_state: geoResult ? (geoResult.state || '') : '',
      geocode_county: geoResult ? (geoResult.county || '') : '',
      geocode_country: geoResult ? (geoResult.country || '') : '',
      geocode_source: geoResult ? (geoResult.source || '') : 'no-address',
      category: cat,
      color: col,
      pin_letter: letr,
      created_at: msgTimestamp,
      processed: geoResult ? 1 : 0,
    }).returning('call_id').then(function (result) {
      var callId = Array.isArray(result) ? (result[0].call_id || result[0]) : result;
      pushToMap({
        call_id: callId,
        address: parsed.address || '',
        cross_streets: parsed.cross_streets || '',
        alias: parsed.alias || '',
        sent_by: parsed.sent_by || '',
        incident_type: parsed.incident_type || '',
        category: cat,
        color: col,
        pin_letter: letr,
        raw_text: messageText,
        message_timestamp: parsed.timestamp || '',
        lat: geoResult ? geoResult.lat : null,
        lng: geoResult ? geoResult.lng : null,
        formatted_address: geoResult ? (geoResult.formatted_address || '') : '',
        geocode_city: geoResult ? (geoResult.city || '') : '',
        geocode_state: geoResult ? (geoResult.state || '') : '',
        geocode_county: geoResult ? (geoResult.county || '') : '',
        geocode_country: geoResult ? (geoResult.country || '') : '',
        geocode_source: geoResult ? (geoResult.source || '') : 'no-address',
      created_at: msgTimestamp,
        processed: geoResult ? 1 : 0,
      }, config);
      return callId;
    }).catch(function (err) {
      logger.main.error('Geocoder: Failed to insert pager_call: ' + err.message);
    });
  });
}

function resolveIncidentType(rawType, msgTimestamp, isRetrigger) {
  if (!rawType) return Promise.resolve({ category: 'Other', color: '#6c757d', pin_letter: 'O' });

  return db('incident_types')
    .select('category', 'color', 'pin_letter', 'active')
    .where('name', rawType)
    .limit(1)
    .then(function (rows) {
      if (rows.length > 0) {
        if (rows[0].active) {
          return { category: rows[0].category || 'Other', color: rows[0].color || '#6c757d', pin_letter: rows[0].pin_letter || 'O' };
        }
        return { category: 'Other', color: '#6c757d', pin_letter: 'O' };
      }
      var defaults = getDefaultForType(rawType);
      if (!isRetrigger) {
        db('incident_types').insert({
          name: rawType,
          display_name: rawType,
          category: defaults.category,
          color: defaults.color,
          pin_letter: defaults.pin_letter,
          active: 1,
      created_at: msgTimestamp,
        }).catch(function () {
          logger.main.debug('Geocoder: Type insertion skipped (may already exist): ' + rawType);
        });
      }
      return defaults;
    });
}

function getDefaultForType(raw) {
  var t = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (t === 'WORKINGFIRE' || t.includes('FIRE') && !t.startsWith('ALARM'))
                                    return { category: 'Fire',       color: '#dc3545', pin_letter: t.includes('STRUCT') ? 'SF' : t.includes('VEHICL') ? 'VF' : t.includes('MINOR') ? 'MF' : t === 'WORKINGFIRE' ? 'WF' : 'F' };
  if (t.startsWith('ALARM'))        return { category: 'Alarms',     color: '#6f42c1', pin_letter: t.slice(5, 7) || 'AL' };
  if (t === 'MEDICAL')              return { category: 'Medical',    color: '#0d6efd', pin_letter: 'MED' };
  if (t.startsWith('MVC'))           return { category: 'Traffic',    color: '#ffc107', pin_letter: 'MVC' };
  if (t === 'RESCUE')               return { category: 'Rescue',     color: '#20c997', pin_letter: 'R' };
  if (t.includes('HAZMAT'))         return { category: 'HazMat',     color: '#fd7e14', pin_letter: 'HZ' };
  if (t.includes('GAS'))            return { category: 'Utilities',  color: '#8b4513', pin_letter: 'NG' };
  if (t === 'ASSIST')               return { category: 'Assist',     color: '#17a2b8', pin_letter: 'A' };
  if (t === 'MUTUALAID')            return { category: 'Mutual Aid', color: '#e83e8c', pin_letter: 'MA' };
  if (t === 'ALARMS')               return { category: 'Alarms',     color: '#6f42c1', pin_letter: 'AL' };
  return                             { category: 'Other',      color: '#6c757d', pin_letter: 'O' };
}

function buildMapImageUrl(lat, lng, category, color, zoom) {
  nconf.load();
  var baseUrl = nconf.get('publicmap:baseurl') || 'http://127.0.0.1:5000';
  var cat = category || 'Other';
  var url = baseUrl + '/map-image?lat=' + lat + '&lng=' + lng + '&incident=' + encodeURIComponent(cat);
  if (color) url += '&color=' + encodeURIComponent(color);
  if (zoom) url += '&zoom=' + zoom;
  return url;
}

function buildMapImagePlaceholderUrl() {
  nconf.load();
  var baseUrl = nconf.get('publicmap:baseurl') || 'http://127.0.0.1:5000';
  return baseUrl + '/map-image/placeholder';
}

function run(trigger, scope, data, config, callback) {
  if (!config.enable) return callback(data);

  config.rateLimitMs = parseInt(config.rateLimitMs, 10) || 1100;

  var messageText = data.message || '';
  if (messageText.indexOf('[TEST RETRIGGER] ') === 0) {
    messageText = messageText.substring(18);
  }
  var isRetrigger = !!(data.pluginData && data.pluginData.retrigger);
  var msgTimestamp = data.timestamp || Math.floor(Date.now() / 1000);
  var source = data.source || 'UNK';
  var capAlias = data.alias || '';

  var parsed = parseMessage(messageText);

  if (!parsed.address) {
    logger.main.debug('Geocoder: No address found in message from ' + source);
    insertPagerCall(parsed, null, null, config, messageText, msgTimestamp, data);
    return callback(data);
  }

  if (!parsed.sent_by) parsed.sent_by = source;

  if (!parsed.alias && capAlias) {
    parsed.alias = capAlias;
  }

  getLocationContext(parsed.sent_by, parsed.alias).then(function (locationCtx) {
    if (locationCtx) {
      logger.main.debug('Geocoder: Found location context for ' + source + (parsed.alias ? '/' + parsed.alias : ''));
    }

    geocodeNominatim(parsed.address, locationCtx, config).then(function (geoResult) {
      var mapImageUrl, placeholderUrl;
      if (!geoResult) {
        logger.main.info('Geocoder: Geocoding failed for "' + parsed.address + '"');
        placeholderUrl = buildMapImagePlaceholderUrl();
        data.pluginData = data.pluginData || {};
        data.pluginData.map_image_url = placeholderUrl;
        data.map_image_url = placeholderUrl;
      } else {
        logger.main.info('Geocoder: Geocoded "' + parsed.address + '" → ' + geoResult.lat + ', ' + geoResult.lng);
      }

      resolveIncidentType(parsed.incident_type, msgTimestamp, isRetrigger).then(function (typeInfo) {
        if (geoResult) {
          mapImageUrl = buildMapImageUrl(geoResult.lat, geoResult.lng, typeInfo.category, typeInfo.color, config.mapZoom);
        }
        insertPagerCall(parsed, geoResult, typeInfo, config, messageText, msgTimestamp, data).then(function (callId) {
          data.pluginData = data.pluginData || {};
          if (callId) {
            data.pluginData.call_id = callId;
            data.call_id = callId;
          }
          if (geoResult) {
            data.pluginData.geocoded = true;
            data.pluginData.lat = geoResult.lat;
            data.pluginData.lng = geoResult.lng;
            data.pluginData.map_image_url = mapImageUrl;
            data.pluginData.formatted_address = geoResult.formatted_address;
            data.map_image_url = mapImageUrl;
            data.geocoded_lat = geoResult.lat;
            data.geocoded_lng = geoResult.lng;
            data.formatted_address = geoResult.formatted_address;
          }
          callback(data);
        });
      });
    });
  }).catch(function (err) {
    logger.main.error('Geocoder: Error: ' + err.message);
    callback(data);
  });
}

module.exports = { run: run };
