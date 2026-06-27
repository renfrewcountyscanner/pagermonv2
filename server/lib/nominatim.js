/**
 * Nominatim API Client — Rate-Limited, Caching, Policy-Compliant
 *
 * Enforces:
 *   • Interactive: 1 req/sec   (default)
 *   • Bulk:        4 req/min   (bulkMode = true)
 *   • Serial-only: no concurrent requests
 *   • Custom User-Agent header
 *   • In-memory cache
 *   • Exponential backoff on 429 / 5xx
 *   • Retry-After header support
 *   • Request logging
 *   • Configurable base URL
 */

var axios = require('axios').default;
var logger = require('../log');

var NominatimClient = (function () {

  function NominatimClient(options) {
    options = options || {};
    this.baseUrl = options.baseUrl || 'https://nominatim.openstreetmap.org/search';
    this.userAgent = options.userAgent || 'PagerMon/1.0';
    this.rateLimitMs = options.rateLimitMs || 1100;
    this.bulkMode = !!options.bulkMode;
    this.cacheTtlMs = options.cacheTtlMs || 86400000; // 24h default

    this._cache = {};
    this._queue = [];
    this._processing = false;
    this._lastRequestTime = 0;
    this._consecutive429s = 0;
  }

  function _cacheKey(params) {
    return JSON.stringify(Object.keys(params).sort().reduce(function (acc, k) {
      acc[k] = params[k]; return acc;
    }, {}));
  }

  function _cacheGet(key) {
    var entry = this._cache[key];
    if (!entry) return null;
    if (Date.now() - entry.ts > this.cacheTtlMs) {
      delete this._cache[key];
      return null;
    }
    return entry.data;
  }

  function _cacheSet(key, data) {
    this._cache[key] = { data: data, ts: Date.now() };
    if (Object.keys(this._cache).length > 500) {
      var oldest = Object.keys(this._cache).sort(function (a, b) {
        return this._cache[a].ts - this._cache[b].ts;
      }.bind(this))[0];
      delete this._cache[oldest];
    }
  }

  function _delay() {
    var baseDelay = this.bulkMode ? 15000 : this.rateLimitMs;
    var now = Date.now();
    var elapsed = now - this._lastRequestTime;
    return Math.max(0, baseDelay - elapsed);
  }

  function _log(level, message) {
    if (logger && logger.main) {
      logger.main[level]('Nominatim: ' + message);
    }
  }

  function _fetch(params, retries, resolve, reject) {
    var self = this;
    var key = _cacheKey(params);
    var cached = _cacheGet.call(self, key);
    if (cached) {
      _log.call(self, 'debug', 'Cache hit: ' + params.q);
      return resolve(cached);
    }

    var delay = _delay.call(self);
    if (delay > 0) {
      return setTimeout(function () { _doFetch.call(self, params, key, retries, resolve, reject); }, delay);
    }
    _doFetch.call(self, params, key, retries, resolve, reject);
  }

  function _doFetch(params, key, retries, resolve, reject) {
    var self = this;
    self._lastRequestTime = Date.now();

    _log.call(self, 'debug', 'GET ' + params.q);

    axios.get(self.baseUrl, {
      params: params,
      timeout: 10000,
      headers: { 'User-Agent': self.userAgent, 'Accept': 'application/json' },
      validateStatus: function () { return true; },
    }).then(function (resp) {
      var status = resp.status;

      if (status === 429) {
        self._consecutive429s++;
        var retryAfter = parseInt(resp.headers['retry-after'], 10) || 5;
        retryAfter = Math.min(retryAfter * (self._consecutive429s), 60);
        _log.call(self, 'warn', 'Rate limited (429) — retrying in ' + retryAfter + 's');
        self._lastRequestTime = Date.now() + (retryAfter * 1000);
        if (retries > 0) {
          setTimeout(function () { _doFetch.call(self, params, key, retries - 1, resolve, reject); }, retryAfter * 1000);
        } else {
          _log.call(self, 'error', 'Max retries exceeded for: ' + params.q);
          resolve(null);
        }
        return;
      }

      self._consecutive429s = 0;

      if (status >= 500) {
        var backoff = Math.min(2000 * Math.pow(2, (3 - retries)), 30000);
        _log.call(self, 'error', 'Server error ' + status + ' — retrying in ' + (backoff / 1000) + 's');
        if (retries > 0) {
          setTimeout(function () { _doFetch.call(self, params, key, retries - 1, resolve, reject); }, backoff);
        } else {
          resolve(null);
        }
        return;
      }

      if (status !== 200) {
        _log.call(self, 'error', 'Unexpected status ' + status + ' for: ' + params.q);
        resolve(null);
        return;
      }

      var data = resp.data;
      _cacheSet.call(self, key, data);
      self._consecutive429s = 0;
      resolve(data);
    }).catch(function (err) {
      _log.call(self, 'error', 'Request error: ' + err.message);
      if (retries > 0) {
        setTimeout(function () { _doFetch.call(self, params, key, retries - 1, resolve, reject); }, 2000);
      } else {
        resolve(null);
      }
    });
  }

  function _processQueue() {
    var self = this;
    if (self._processing || self._queue.length === 0) return;
    self._processing = true;
    var item = self._queue.shift();
    _fetch.call(self, item.params, item.retries, function (result) {
      item.resolve(result);
      self._processing = false;
      _processQueue.call(self);
    }, item.reject);
  }

  NominatimClient.prototype.geocode = function (query, countrycode, options) {
    var self = this;
    options = options || {};
    return new Promise(function (resolve, reject) {
      var params = {
        q: query,
        format: 'json',
        limit: options.limit || 3,
      };
      if (countrycode) params.countrycodes = countrycode;
      if (options.viewbox) {
        params.viewbox = options.viewbox;
        params.bounded = options.bounded || 0;
      }
      if (options.addressdetails !== false) params.addressdetails = 1;

      self._queue.push({
        params: params,
        retries: options.retries !== undefined ? options.retries : 3,
        resolve: resolve,
        reject: reject,
      });
      _processQueue.call(self);
    });
  };

  NominatimClient.prototype.clearCache = function () {
    this._cache = {};
  };

  NominatimClient.prototype.cacheSize = function () {
    return Object.keys(this._cache).length;
  };

  return NominatimClient;
})();

module.exports = NominatimClient;
