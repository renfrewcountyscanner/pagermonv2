var express = require('express');
var bodyParser = require('body-parser');
var router = express.Router();
var basicAuth = require('express-basic-auth');
var bcrypt = require('bcryptjs');
var util = require('util');
var _ = require('underscore');
var pluginHandler = require('../plugins/pluginHandler');
var logger = require('../log');
var db = require('../knex/knex.js');
var converter = require('json-2-csv');
var livelog = require('../lib/livelog');
var { body, validationResult } = require('express-validator');

var nconf = require('nconf');

var confFile = './config/config.json';
nconf.file({ file: confFile });
nconf.load();

router.use(bodyParser.json());       // to support JSON-encoded bodies
router.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));

const passport = require('../auth/local');
var authHelper = require('../middleware/authhelper')

router.use(function (req, res, next) {
  res.locals.login = req.isAuthenticated();
  res.locals.user = req.user || false;
  next();
});

// defaults
var initData = {};
initData.limit = nconf.get('messages:defaultLimit');
initData.replaceText = nconf.get('messages:replaceText');
initData.currentPage = 0;
initData.pageCount = 0;
initData.msgCount = 0;
initData.offset = 0;

// auth variables
var HideCapcode = nconf.get('messages:HideCapcode');
var apiSecurity = nconf.get('messages:apiSecurity');
var dbtype = nconf.get('database:type');

// dupe init
var msgBuffer = [];

// Session info endpoint for the Vue SPA
router.get('/me', function (req, res) {
  if (req.isAuthenticated()) {
    res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        givenname: req.user.givenname,
        surname: req.user.surname,
        email: req.user.email,
        role: req.user.role,
      },
    });
  } else {
    res.json({ authenticated: false, user: null });
  }
});

// Test-publish endpoint — emits a synthetic event to all connected viewers.
// Lets users verify end-to-end delivery without waiting for a real page.
router.post('/livelog/test', authHelper.isLoggedInMessages, function (req, res) {
  livelog.publish({
    id: 'test-' + Date.now(),
    timestamp: Math.floor(Date.now() / 1000),
    message: '*** TEST EVENT *** ' + new Date().toISOString(),
    source: 'self-test',
    alias: 'Test',
    agency: 'self-test',
    address: 'TEST',
    alias_id: null,
    ignore: 0,
  });
  res.json({ ok: true, clients: livelog.clientCount() });
});

// SSE stream of incoming pages for the live-log viewer.
// Visibility mirrors /api/messages: respects apiSecurity, HideCapcode, and pdwMode.
router.get('/livelog/stream', authHelper.isLoggedInMessages, function (req, res) {
  nconf.load();
  var hideCapcode = !!nconf.get('messages:HideCapcode');
  var hideSource = !!nconf.get('messages:HideSource');
  var pdwMode = !!nconf.get('messages:pdwMode');
  var adminShow = !!nconf.get('messages:adminShow');
  var isAdmin = req.isAuthenticated() && req.user && req.user.role === 'admin';

  function filter(row) {
    // pdwMode hides un-aliased traffic from non-admins (and from admins unless adminShow is on).
    if (pdwMode) {
      if (row.alias_id == null) {
        if (!(isAdmin && adminShow)) return null;
      }
    }
    if (row.ignore && !isAdmin) return null;

    var out = {
      id: row.id,
      timestamp: row.timestamp,
      message: row.message,
      alias_id: row.alias_id,
      alias: row.alias,
      agency: row.agency,
      icon: row.icon,
      color: row.color,
    };
    if (!hideSource || isAdmin) out.source = row.source;
    if (!hideCapcode || isAdmin) out.address = row.address;
    return out;
  }

  // Setting Content-Encoding before the response body causes the global compression
  // middleware to skip this response, so EventSource browsers receive frames immediately
  // instead of waiting for the gzip buffer to fill.
  res.setHeader('Content-Encoding', 'identity');
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders && res.flushHeaders();
  // 4KB of comment padding to defeat reverse-proxy buffering (Cloudflare/nginx
  // often hold the response until a few KB have arrived).
  res.write(': ' + new Array(2049).join(' ') + '\n\n');
  res.write('retry: 5000\n\n');
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true, role: isAdmin ? 'admin' : 'user' })}\n\n`);
  res.flush && res.flush();

  livelog.add(res, filter);
  logger.main.info('livelog: SSE client connected (role=' + (isAdmin ? 'admin' : 'user') + ', total=' + livelog.clientCount() + ')');

  // Replay-on-connect: confirms end-to-end delivery even when no fresh pages
  // are arriving. Sent ~500ms after connect so the EventSource is bound.
  setTimeout(function () {
    try {
      res.write('data: ' + JSON.stringify({
        id: 'connect-' + Date.now(),
        timestamp: Math.floor(Date.now() / 1000),
        message: '— live log connected (' + livelog.clientCount() + ' viewer' + (livelog.clientCount() === 1 ? '' : 's') + ') —',
        source: 'system',
        alias: '',
        agency: '',
        address: '',
      }) + '\n\n');
      res.flush && res.flush();
    } catch (_) {}
  }, 500);
  req.on('close', function () {
    livelog.remove(res);
    logger.main.info('livelog: SSE client disconnected (total=' + livelog.clientCount() + ')');
  });
});

// Public app config for the Vue SPA (non-sensitive values only)
router.get('/appconfig', function (req, res) {
  nconf.load();
  res.json({
    monitorName: nconf.get('global:monitorName') || 'PagerMon',
    registration: !!nconf.get('auth:registration'),
    apiSecurity: !!nconf.get('messages:apiSecurity'),
    timezone: nconf.get('global:timezone') || 'America/Toronto',
    mapLat: nconf.get('global:mapLat') || 45.42,
    mapLng: nconf.get('global:mapLng') || -75.70,
  });
});

router.route('/messages')
  .get(authHelper.isLoggedInMessages, function (req, res, next) {
    nconf.load();
    console.time('init');
    var pdwMode = nconf.get('messages:pdwMode');
    var adminShow = nconf.get('messages:adminShow');
    var maxLimit = nconf.get('messages:maxLimit');
    var defaultLimit = nconf.get('messages:defaultLimit');
    var HideCapcode = nconf.get('messages:HideCapcode');

    initData.replaceText = nconf.get('messages:replaceText');
    if (typeof req.query.page !== 'undefined') {
      var page = parseInt(req.query.page, 10);
      if (page > 0) {
        initData.currentPage = page - 1;
      } else {
        initData.currentPage = 0;
      }
    }
    if (req.query.limit && req.query.limit <= maxLimit) {
      initData.limit = parseInt(req.query.limit, 10);
    } else {
      initData.limit = parseInt(defaultLimit, 10);
    }

    var sortField = req.query.sort || 'timestamp';
    var sortDir = req.query.dir === 'asc' ? 'asc' : 'desc';
    var dateFrom = req.query.from ? new Date(req.query.from) : null;
    var dateTo = req.query.to ? new Date(req.query.to + 'T23:59:59Z') : null;

    if (pdwMode) {
      if (adminShow && req.isAuthenticated() && req.user.role == 'admin') {
        var subquery = db.from('capcodes').where('ignore', '=', 1).select('id')
      } else {
        var subquery = db.from('capcodes').where('ignore', '=', 0).select('id')
      }
    } else {
      var subquery = db.from('capcodes').where('ignore', '=', 1).select('id')
    }
    db.from('messages').where(function () {
      if (pdwMode) {
        if (adminShow && req.isAuthenticated() && req.user.role == 'admin') {
          this.from('messages').where('alias_id', 'not in', subquery).orWhereNull('alias_id')
        } else {
          this.from('messages').where('alias_id', 'in', subquery)
        }
      } else {
        this.from('messages').where('alias_id', 'not in', subquery).orWhereNull('alias_id')
      }
      if (dateFrom) this.where('timestamp', '>=', Math.floor(dateFrom.getTime() / 1000))
      if (dateTo)   this.where('timestamp', '<=', Math.floor(dateTo.getTime() / 1000))
    }).count('* as msgcount')
      .then(function (initcount) {
        var count = initcount[0]
        if (count) {
          initData.msgCount = count.msgcount;
          initData.pageCount = Math.ceil(initData.msgCount / initData.limit);
          if (initData.currentPage > initData.pageCount) {
            initData.currentPage = 0;
          }
          initData.offset = initData.limit * initData.currentPage;
          if (initData.offset < 0) {
            initData.offset = 0;
          }
          initData.offsetEnd = initData.offset + initData.limit;
          console.timeEnd('init');
          console.time('sql');

          var result = [];
          var rowCount

          var sortColumnMap = {
            timestamp: 'messages.timestamp',
            source: 'messages.source',
            address: 'messages.address',
            agency: 'capcodes.agency',
            alias: 'capcodes.alias',
            message: 'messages.message'
          }
          var sortCol = sortColumnMap[sortField] || 'messages.timestamp'

          db.from('messages')
            .select('messages.*', 'capcodes.alias', 'capcodes.agency', 'capcodes.icon', 'capcodes.color', 'capcodes.ignore', db.raw('CASE WHEN NOT capcodes.address = messages.address THEN 1 ELSE 0 END as wildcard'))
            .modify(function (queryBuilder) {
              if (pdwMode) {
                if (adminShow && req.isAuthenticated() && req.user.role == 'admin') {
                  queryBuilder.leftJoin('capcodes', 'capcodes.id', '=', 'messages.alias_id').where('capcodes.ignore', 0).orWhereNull('capcodes.ignore')
                } else {
                  queryBuilder.innerJoin('capcodes', 'capcodes.id', '=', 'messages.alias_id').where('capcodes.ignore', 0)
                }
              } else {
                queryBuilder.leftJoin('capcodes', 'capcodes.id', '=', 'messages.alias_id').where('capcodes.ignore', 0).orWhereNull('capcodes.ignore')
              }
              if (dateFrom) queryBuilder.where('messages.timestamp', '>=', Math.floor(dateFrom.getTime() / 1000))
              if (dateTo)   queryBuilder.where('messages.timestamp', '<=', Math.floor(dateTo.getTime() / 1000))
            })
            .orderBy(sortCol, sortDir)
            .limit(initData.limit)
            .offset(initData.offset)
            .then(rows => {
              rowCount = rows.length
              for (row of rows) {
                //outRow = JSON.parse(newrow);
                if (HideCapcode) {
                  if (!req.isAuthenticated() || (req.isAuthenticated() && req.user.role == 'user')) {
                    row = {
                      "id": row.id,
                      "message": row.message,
                      "source": row.source,
                      "timestamp": row.timestamp,
                      "alias_id": row.alias_id,
                      "alias": row.alias,
                      "agency": row.agency,
                      "icon": row.icon,
                      "color": row.color,
                      "ignore": row.ignore
                    };
                  }
                }
                if (row) {
                  result.push(row);
                } else {
                  logger.main.info('empty results');
                }
              }
            })
            .catch(err => {
              logger.main.error(err);
            })
            .finally(() => {
              if (rowCount > 0) {
                console.timeEnd('sql');
                //var limitResults = result.slice(initData.offset, initData.offsetEnd);
                console.time('send');
                res.status(200).json({ 'init': initData, 'messages': result });
                console.timeEnd('send');
              } else {
                res.status(200).json({ 'init': {}, 'messages': [] });
              }
            });
        }
      });
  })
  .post(authHelper.isAdmin,
    body('address').trim().isLength({ min: 1, max: 50 }).escape(),
    body('message').trim().isLength({ min: 1, max: 2000 }),
    body('datetime').optional().isInt(),
    body('source').optional().trim().isLength({ max: 100 }).escape(),
    function (req, res, next) {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      nconf.load();
      if (req.body.address && req.body.message) {
      var dbtype = nconf.get('database:type');
      var filterDupes = nconf.get('messages:duplicateFiltering');
      var dupeLimit = nconf.get('messages:duplicateLimit') || 0; // default 0
      var dupeTime = nconf.get('messages:duplicateTime') || 0; // default 0
      var pdwMode = nconf.get('messages:pdwMode');
      var adminShow = nconf.get('messages:adminShow');
      var data = req.body;
      data.pluginData = {};
      var isRetrigger = !!data.retrigger;

      // ── Retrigger: bypass dedup ──
      if (!isRetrigger) {

      if (filterDupes) {
        // this is a bad solution and tech debt that will bite us in the ass if we ever go HA, but that's a problem for future me and that guy's a dick
        var datetime = data.datetime ? Math.floor(Number(data.datetime)) : Math.floor(Date.now() / 1000);
        var timeDiff = datetime - dupeTime;
        // if duplicate filtering is enabled, we want to populate the message buffer and check for duplicates within the limits
        var matches = msgBuffer.filter(function(msg) {
          return msg.address === data.address && (
            msg.message === data.message ||
            data.message.startsWith(msg.message) ||
            msg.message.startsWith(data.message)
          );
        });
        if (matches.length > 0) {
          if (dupeTime != 0) {
            // search the matching messages and see if any match the time constrain
            var timeFind = _.find(matches, function (msg) { return msg.datetime > timeDiff; });
            if (timeFind) {
              logger.main.info(util.format('Ignoring duplicate: %o', data.message));
              res.status(200);
              return res.send('Ignoring duplicate');
            }
          } else {
            // if no dupeTime then just end the search now, we have matches
            logger.main.info(util.format('Ignoring duplicate: %o', data.message));
            res.status(200);
            return res.send('Ignoring duplicate');
          }
        }
        // no matches, maintain the array
        var dupeArrayLimit = dupeLimit;
        if (dupeArrayLimit == 0) {
          dupeArrayLimit = 25; // should provide sufficient buffer, consider increasing if duplicates appear when users have no dupeLimit
        }
        if (msgBuffer.length > dupeArrayLimit) {
          msgBuffer.shift();
        }
        msgBuffer.push({ message: data.message, datetime: data.datetime, address: data.address });
      }
      }

      // send data to pluginHandler before proceeding
      logger.main.debug('beforeMessage start');
      pluginHandler.handle('message', 'before', data, function (response) {
        logger.main.debug(util.format('%o', response));
        logger.main.debug('beforeMessage done');
        if (response && response.pluginData) {
          // only set data to the response if it's non-empty and still contains the pluginData object
          data = response;
        }
        if (data.pluginData.ignore) {
          // stop processing
          res.status(200);
          return res.send('Ignoring filtered');
        }
        var address = data.address || '0000000';
        var message = data.message || 'null';
        var datetime = data.datetime ? Math.floor(Number(data.datetime)) : Math.floor(Date.now() / 1000);
        var timeDiff = datetime - dupeTime;
        var source = data.source || 'UNK';
        db.from('messages')
          .select('*')
          .modify(function (queryBuilder) {
            if ((dupeLimit != 0) && (dupeTime != 0)) {
              queryBuilder.where('id', 'in', function () {
                this.select('*')
                  //this wierd subquery is to keep mysql happy
                  .from(function () {
                    this.select('id')
                      .from('messages')
                      .where('timestamp', '>', timeDiff)
                      .orderBy('id', 'desc')
                      .limit(dupeLimit)
                      .as('temp_tab')
                  })
              })
                .andWhere('address', '=', address)
            } else if ((dupeLimit != 0) && (dupeTime == 0)) {
              queryBuilder.where('id', 'in', function () {
                this.select('*')
                  //this wierd subquery is to keep mysql happy
                  .from(function () {
                    this.select('id')
                      .from('messages')
                      .orderBy('id', 'desc')
                      .limit(dupeLimit)
                      .as('temp_tab')
                  })
              })
                .andWhere('address', '=', address)
            } else if ((dupeLimit == 0) && (dupeTime != 0)) {
              queryBuilder.where('id', 'in', function () {
                this.select('id')
                  .from('messages')
                  .where('timestamp', '>', timeDiff)
              })
                .andWhere('address', '=', address)
            } else {
              queryBuilder.where('address', '=', address)
            }
          })
          .then((row) => {
            var isDup = row.length > 0 && row.some(function(r) {
              return r.message === message ||
                message.startsWith(r.message) ||
                r.message.startsWith(message);
            });
            if (isDup && filterDupes && !isRetrigger) {
              logger.main.info(util.format('Ignoring duplicate: %o', message));
              res.status(200);
              res.send('Ignoring duplicate');
            } else {
              // Step 1: address LIKE match (primary). req.user is the API key's `name`
              // when the login-api strategy authenticated this POST.
              var apiKeyName = (typeof req.user === 'string') ? req.user : null;
              var addressQuery = db.from('capcodes')
                .select('id', 'ignore')
                // TODO: test this doesn't break other DBs - there's a lot of quote changes here
                .modify(function (queryBuilder) {
                  if (dbtype == 'oracledb') {
                    queryBuilder.whereRaw('? LIKE "address"', [address])
                    queryBuilder.andWhereRaw('("match_type" IS NULL OR "match_type" = \'address\')')
                    queryBuilder.orderByRaw(`REPLACE("address", '_', '%') DESC`);
                  } else {
                    queryBuilder.whereRaw('? LIKE address', [address])
                    queryBuilder.andWhereRaw('(match_type IS NULL OR match_type = \'address\')')
                    queryBuilder.orderByRaw(`REPLACE(address, '_', '%') DESC`)
                  }
                });

              addressQuery.then(function (addressRow) {
                // Step 2: API-key fallback only if no address-typed alias matched.
                var apikeyLookup = (addressRow && addressRow.length > 0)
                  ? Promise.resolve([])
                  : (apiKeyName
                    ? db.from('capcodes')
                        .select('id', 'ignore')
                        .where('match_type', '=', 'apikey')
                        .andWhere('address', '=', apiKeyName)
                        .limit(1)
                    : Promise.resolve([]));

                apikeyLookup.then(function (apikeyRow) {
                  // Address match wins; fall back to API-key alias if no address match.
                  var pickedRow = (addressRow && addressRow.length > 0)
                    ? addressRow
                    : (apikeyRow && apikeyRow.length > 0 ? apikeyRow : []);

                  Promise.resolve(pickedRow).then((row) => {
                  var insert;
                  var alias_id = null;
                  if (row.length > 0) {
                    row = row[0]
                    if (row.ignore == 1) {
                      insert = false;
                      logger.main.info('Ignoring filtered address: ' + address + ' alias: ' + row.id);
                    } else {
                      insert = true;
                      alias_id = row.id;
                    }
                  } else {
                    insert = true;
                  }

                  // overwrite alias_id if set from plugin
                  if (data.pluginData.aliasId) {
                    alias_id = data.pluginData.aliasId;
                  }

                  if (insert == true) {
                    var insertmsg = { address: address, message: message, timestamp: datetime, source: source, alias_id: alias_id }
                    if (isRetrigger) insertmsg.message = '[TEST RETRIGGER] ' + insertmsg.message;
                    db('messages').insert(insertmsg).returning('id')
                      .then((result) => {
                        // emit the full message
                        var msgId;
                        if (Array.isArray(result)) {
                          msgId = result[0];
                        } else {
                          msgId = result;
                        }
                        logger.main.debug(result);

                        if (dbtype == 'oracledb') {
                          // oracle requires update of search index after insert, can't be trigger for some reason
                          db.raw(`BEGIN CTX_DDL.SYNC_INDEX('search_idx'); END;`)
                            .then((resp) => {
                              logger.main.debug('search_idx sync complete');
                              logger.main.debug(resp);
                            }).catch((err) => {
                              logger.main.error('search_idx sync failed');
                              logger.main.error(err)
                            });
                        }

                        db.from('messages')
                          .select('messages.*', 'capcodes.alias', 'capcodes.agency', 'capcodes.icon', 'capcodes.color', 'capcodes.ignore', 'capcodes.pluginconf')
                          .modify(function (queryBuilder) {
                            queryBuilder.leftJoin('capcodes', 'capcodes.id', '=', 'messages.alias_id')
                          })
                          .where('messages.id', '=', msgId)
                          .then((row) => {
                            if (row.length > 0) {
                              row = row[0]
                              // send data to pluginHandler after processing
                              row.pluginData = data.pluginData;

                              if (row.pluginconf) {
                                row.pluginconf = parseJSON(row.pluginconf);
                              } else {
                                row.pluginconf = {};
                              }
                              logger.main.debug('afterMessage start');
                              pluginHandler.handle('message', 'after', row, function (response) {
                                logger.main.debug(util.format('%o', response));
                                logger.main.debug('afterMessage done');
                                // remove the pluginconf object before firing socket message
                                delete row.pluginconf;
                                // broadcast to live-log SSE listeners (one publish per accepted page)
                                livelog.publish(row);
                                //begin socket handling - this is the most horrible block of spaghetti code i've seen in my life and i hate myself for being involved in it
                                if (HideCapcode) {
                                  if (pdwMode) {
                                    if (adminShow) {
                                      //If PDWMode on and AdminShow is on send always
                                      req.io.of('adminio').emit('messagePost', row);
                                      if (row.alias_id != null) {
                                        // send to normal user as well if not null alias_id
                                        rowuser = {
                                          "id": row.id,
                                          "message": row.message,
                                          "source": row.source,
                                          "timestamp": row.timestamp,
                                          "alias_id": row.alias_id,
                                          "alias": row.alias,
                                          "agency": row.agency,
                                          "icon": row.icon,
                                          "color": row.color,
                                          "ignore": row.ignore
                                        };
                                        req.io.emit('messagePost', rowuser);
                                      }
                                    } else {
                                      // if AdminShow not on only send if not null alias_id
                                      if (row.alias_id != null) {
                                        req.io.of('adminio').emit('messagePost', row);
                                        rowuser = {
                                          "id": row.id,
                                          "message": row.message,
                                          "source": row.source,
                                          "timestamp": row.timestamp,
                                          "alias_id": row.alias_id,
                                          "alias": row.alias,
                                          "agency": row.agency,
                                          "icon": row.icon,
                                          "color": row.color,
                                          "ignore": row.ignore
                                        };
                                        req.io.emit('messagePost', rowuser);
                                      }
                                    }
                                  } else {
                                    req.io.of('adminio').emit('messagePost', row);
                                    rowuser = {
                                      "id": row.id,
                                      "message": row.message,
                                      "source": row.source,
                                      "timestamp": row.timestamp,
                                      "alias_id": row.alias_id,
                                      "alias": row.alias,
                                      "agency": row.agency,
                                      "icon": row.icon,
                                      "color": row.color,
                                      "ignore": row.ignore
                                    };
                                    req.io.emit('messagePost', rowuser);
                                  }
                                } else {
                                  if (pdwMode) {
                                    if (adminShow) {
                                      //If PDWMode on and AdminShow is on send always
                                      req.io.of('adminio').emit('messagePost', row);
                                      if (row.alias_id != null) {
                                        // send to normal user as well if not null alias_id
                                        req.io.emit('messagePost', row);
                                      }
                                    } else {
                                      // if AdminShow not on only send if not null alias_id
                                      if (row.alias_id != null) {
                                        req.io.of('adminio').emit('messagePost', row);
                                        req.io.emit('messagePost', row);
                                      }
                                    }
                                  } else {
                                    req.io.of('adminio').emit('messagePost', row);
                                    req.io.emit('messagePost', row);
                                  }
                                }
                              });
                            }
                            res.status(200).send('' + result);
                          })
                          .catch((err) => {
                            res.status(500).send(err);
                            logger.main.error(err)
                          })
                      })
                      .catch((err) => {
                        res.status(500).send(err);
                        logger.main.error(err)
                      })
                  } else {
                    res.status(200);
                    res.send('Ignoring filtered');
                  }
                })
                .catch((err) => {
                  res.status(500).send(err);
                  logger.main.error(err)
                })
                })
                .catch((err) => {
                  res.status(500).send(err);
                  logger.main.error(err)
                })
              })
              .catch((err) => {
                res.status(500).send(err);
                logger.main.error(err)
              })
            }
          })
          .catch((err) => {
            res.status(500).send(err);
            logger.main.error(err)
          })
      })
    } else {
      res.status(500).json({ message: 'Error - address or message missing' });
    }
  });


router.route('/messages/:id/retrigger')
  .post(authHelper.isAdmin, function (req, res) {
    db('messages').select('address', 'message', 'source', 'timestamp')
      .where('id', req.params.id).first()
      .then(function (row) {
        if (!row) return res.status(404).json({ error: 'Message not found' });
        var payload = {
          address: row.address,
          message: row.message,
          source: row.source,
          datetime: row.timestamp,
          retrigger: true
        };
        var axios = require('axios').default;
        var apikey = req.headers.apikey || '';
        if (!apikey) {
          nconf.load();
          var keys = nconf.get('auth:keys') || [];
          var selected = keys.find(function(k) { return k.selected; });
          if (selected) apikey = selected.key;
        }
        var port = nconf.get('app:port') || 3000;
        axios.post('http://127.0.0.1:' + port + '/api/messages', payload, {
          headers: { 'Content-Type': 'application/json', 'apikey': apikey },
          timeout: 30000
        }).then(function (resp) {
          res.status(200).send('' + resp.data);
        }).catch(function (err) {
          logger.main.error('Retrigger failed: ' + err.message);
          res.status(500).send(err.message);
        });
      })
      .catch(function (err) { logger.main.error(err); res.status(500).send(err); });
  });

router.route('/messages/:id')
  .get(authHelper.isLoggedInMessages, function (req, res, next) {
    nconf.load();
    var pdwMode = nconf.get('messages:pdwMode');
    var HideCapcode = nconf.get('messages:HideCapcode');
    var apiSecurity = nconf.get('messages:apiSecurity');
    var id = req.params.id;

    db.from('messages')
      .select('messages.*', 'capcodes.alias', 'capcodes.agency', 'capcodes.icon', 'capcodes.color', 'capcodes.ignore', db.raw('CASE WHEN NOT capcodes.address = messages.address THEN 1 ELSE 0 END as wildcard'))
      .leftJoin('capcodes', 'capcodes.id', '=', 'messages.alias_id')
      .where('messages.id', id)
      .then((row) => {
        if (HideCapcode) {
          if (!req.isAuthenticated() || (req.isAuthenticated() && req.user.role == 'user')) {
            row = {
              "id": row[0].id,
              "message": row[0].message,
              "source": row[0].source,
              "timestamp": row[0].timestamp,
              "alias_id": row[0].alias_id,
              "alias": row[0].alias,
              "agency": row[0].agency,
              "icon": row[0].icon,
              "color": row[0].color,
              "ignore": row[0].ignore
            };
          }
        }
        if (row.ignore == 1) {
          res.status(200).json({});
        } else {
          if (pdwMode && !row.alias) {
            res.status(200).json({});
          } else {
            res.status(200).json(row);
          }
        }
      })
      .catch((err) => {
        res.status(500).send(err);
      })
  });

router.route('/messageSearch')
  .get(authHelper.isLoggedInMessages, function (req, res, next) {
    nconf.load();
    var dbtype = nconf.get('database:type');
    var pdwMode = nconf.get('messages:pdwMode');
    var adminShow = nconf.get('messages:adminShow');
    var maxLimit = nconf.get('messages:maxLimit');
    var HideCapcode = nconf.get('messages:HideCapcode');
    var defaultLimit = nconf.get('messages:defaultLimit');
    initData.replaceText = nconf.get('messages:replaceText');

    var page = (req.query.page && parseInt(req.query.page, 10) > 0)
      ? parseInt(req.query.page, 10) - 1 : 0;
    var limit = (req.query.limit && req.query.limit <= maxLimit)
      ? parseInt(req.query.limit, 10) : parseInt(defaultLimit, 10);

    var query   = req.query.q       || '';
    var agency  = req.query.agency  || '';
    var address = req.query.address || '';
    var alias   = req.query.alias   || '';
    var dateFrom = req.query.dateFrom ? parseInt(req.query.dateFrom, 10) : null;
    var dateTo   = req.query.dateTo   ? parseInt(req.query.dateTo,   10) : null;

    var useFTS = (dbtype === 'sqlite3' && query !== '');

    function applyFilters(qb, isFts) {
      if (isFts) {
        qb.leftJoin('messages', 'messages.id', '=', 'messages_search_index.rowid');
      }
      if (pdwMode) {
        if (adminShow && req.isAuthenticated() && req.user.role === 'admin') {
          qb.leftJoin('capcodes', 'capcodes.id', '=', 'messages.alias_id');
        } else {
          qb.innerJoin('capcodes', 'capcodes.id', '=', 'messages.alias_id').where('capcodes.ignore', 0);
        }
      } else {
        qb.leftJoin('capcodes', 'capcodes.id', '=', 'messages.alias_id')
          .where(function () { this.where('capcodes.ignore', 0).orWhereNull('capcodes.ignore'); });
      }
      if (isFts) {
        qb.whereRaw('messages_search_index MATCH ?', [query]);
      } else if (dbtype === 'mysql' && query !== '') {
        qb.whereRaw('MATCH(messages.message, messages.address, messages.source) AGAINST (? IN BOOLEAN MODE)', ['"' + query + '"']);
      } else if (dbtype === 'oracledb' && query !== '') {
        qb.whereRaw('CONTAINS("messages"."message", ?, 1) > 0', [query]);
      } else if (dbtype === 'pg' && query !== '') {
        qb.whereRaw("search_vector @@ plainto_tsquery('english', ?)", [query]);
      } else {
        if (address !== '') qb.where(function () { this.where('messages.address', 'LIKE', address).orWhere('messages.source', address); });
        if (agency  !== '') qb.whereIn('messages.alias_id', function (sub) { sub.select('id').from('capcodes').where('agency', agency).where('ignore', 0); });
        if (alias   !== '') qb.where('messages.alias_id', alias);
      }
      if (dateFrom) qb.where('messages.timestamp', '>=', dateFrom);
      if (dateTo)   qb.where('messages.timestamp', '<=', dateTo);
    }

    // For SQLite FTS3, a simple MATCH count without joins is faster and avoids
    // the FTS3 quirk where MATCH fails to constrain correctly in JOIN queries.
    var countPromise = useFTS
      ? db.raw('SELECT COUNT(*) as count FROM messages_search_index WHERE messages_search_index MATCH ?', [query])
          .then(function (r) { return [{ count: r[0]['COUNT(*)'] !== undefined ? r[0]['COUNT(*)'] : (r[0].count || 0) }]; })
      : (dbtype === 'pg' && query !== '')
        ? db.from('messages').count('* as count').whereRaw("search_vector @@ plainto_tsquery('english', ?)", [query])
            .modify(function (qb) { if (dateFrom) qb.where('messages.timestamp', '>=', dateFrom); if (dateTo) qb.where('messages.timestamp', '<=', dateTo); })
        : db.from('messages').count('* as count').modify(function (qb) { applyFilters(qb, false); });

    countPromise.then(function (countResult) {
      var totalCount = parseInt(countResult[0].count, 10) || 0;
      var pageCount  = totalCount > 0 ? Math.ceil(totalCount / limit) : 0;
      if (page >= pageCount && pageCount > 0) page = 0;
      var offset = limit * page;

      var dataQb = db.select(
        'messages.*',
        'capcodes.alias', 'capcodes.agency', 'capcodes.icon', 'capcodes.color', 'capcodes.ignore',
        db.raw('CASE WHEN NOT capcodes.address = messages.address THEN 1 ELSE 0 END as wildcard')
      );
      if (useFTS) {
        dataQb.from('messages_search_index').modify(function (qb) { applyFilters(qb, true); });
      } else {
        dataQb.from('messages').modify(function (qb) { applyFilters(qb, false); });
      }
      dataQb.orderBy('messages.timestamp', 'desc').limit(limit).offset(offset);

      return dataQb.then(function (rows) {
        var result = [];
        for (var row of rows) {
          if (HideCapcode && (!req.isAuthenticated() || req.user.role === 'user')) {
            row = { id: row.id, message: row.message, source: row.source,
              timestamp: row.timestamp, alias_id: row.alias_id, alias: row.alias,
              agency: row.agency, icon: row.icon, color: row.color, ignore: row.ignore };
          }
          result.push(row);
        }
        var responseInit = {
          limit: limit, currentPage: page, pageCount: pageCount,
          msgCount: totalCount, offset: offset, offsetEnd: offset + limit,
          replaceText: initData.replaceText
        };
        if (result.length > 0) {
          res.status(200).json({ init: responseInit, messages: result });
        } else {
          res.status(200).json({ init: {}, messages: [] });
        }
      });
    }).catch(function (err) {
      logger.main.error(err);
      res.status(500).send(err);
    });
  });

router.route('/capcodes/init')
// DISABLED - UNKNOWN WHAT THIS WAS USED FOR 
/*  
  .get(authHelper.isAdmin, function (req, res, next) {
    //set current page if specifed as get variable (eg: /?page=2)
    if (typeof req.query.page !== 'undefined') {
      var page = parseInt(req.query.page, 10);
      if (page > 0)
        initData.currentPage = page - 1;
    }
    db.from('capcodes')
      .select('id')
      .orderBy('id', 'desc')
      .limit(1)
      .then((row) => {
        initData.msgCount = parseInt(row['id'], 10);
        //console.log(initData.msgCount);
        initData.pageCount = Math.ceil(initData.msgCount / initData.limit);
        var offset = initData.limit * initData.currentPage;
        initData.offset = initData.msgCount - offset;
        if (initData.offset < 0) {
          initData.offset = 0;
        }
        res.json(initData);
      })
      .catch((err) => {
        logger.main.error(err);
        return next(err);
      })
  });
*/
router.route('/capcodes')
  .get(authHelper.isAdmin, function (req, res, next) {
    nconf.load();
    var dbtype = nconf.get('database:type');
    db.from('capcodes')
      .select('*')
      .modify(function (queryBuilder) {
        if (dbtype == 'oracledb')
          queryBuilder.orderByRaw(`REPLACE("address", '_', '%')`);
        else
          queryBuilder.orderByRaw(`REPLACE(address, '_', '%')`)
      })
      .then((rows) => {
        res.json(rows);
      })
      .catch((err) => {
        logger.main.error(err);
        return next(err);
      })
  })
  .post(authHelper.isAdmin, function (req, res, next) {
    nconf.load();
    var updateRequired = nconf.get('database:aliasRefreshRequired');
    if (req.body.address && req.body.alias) {
      var id = req.body.id || null;
      var address = req.body.address || 0;
      var alias = req.body.alias || 'null';
      var agency = req.body.agency || 'null';
      var color = req.body.color || 'black';
      var icon = req.body.icon || 'question';
      var ignore = req.body.ignore || 0;
      var pluginconf = JSON.stringify(req.body.pluginconf) || "{}";
      var match_type = (req.body.match_type === 'apikey') ? 'apikey' : 'address';
      db.from('capcodes')
        .where('id', '=', id)
        .modify(function (queryBuilder) {
          if (id == null) {
            queryBuilder.insert({
              address: address,
              alias: alias,
              agency: agency,
              color: color,
              icon: icon,
              ignore: ignore,
              pluginconf: pluginconf,
              match_type: match_type
            })
          } else {
            queryBuilder.update({
              id: id,
              address: address,
              alias: alias,
              agency: agency,
              color: color,
              icon: icon,
              ignore: ignore,
              pluginconf: pluginconf,
              match_type: match_type
            })
          }
        })
        .returning('id')
        .then((result) => {
          res.status(200);
          res.json({ id: Array.isArray(result) ? result[0]?.id : result, status: 'ok' });
          if (!updateRequired || updateRequired == 0) {
            nconf.set('database:aliasRefreshRequired', 1);
            nconf.save();
          }
        })
        .catch((err) => {
          logger.main.error(err);
          res.status(500).send(err);
        })
      logger.main.debug(util.format('%o', req.body || 'no request body'));
    } else {
      var missing = [];
      if (!req.body.address) missing.push('address');
      if (!req.body.alias) missing.push('alias');
      res.status(400).json({ error: 'Required field' + (missing.length > 1 ? 's' : '') + ' missing: ' + missing.join(', ') });
    }
  });

router.route('/capcodes/agency')
  .get(authHelper.isAdmin, function (req, res, next) {
    db.from('capcodes')
      .distinct('agency')
      .then((rows) => {
        res.status(200);
        res.json(rows);
      })
      .catch((err) => {
        res.status(500);
        res.send(err);
      })
  });

router.route('/capcodes/agency/:id')
  .get(authHelper.isAdmin, function (req, res, next) {
    var id = req.params.id;
    db.from('capcodes')
      .select('*')
      .where('agency', 'like', id)
      .then((rows) => {
        res.status(200);
        res.json(rows);
      })
      .catch((err) => {
        logger.main.error(err);
        return next(err);
      })
  });

router.get('/capcodes/stats', authHelper.isAdmin, function (req, res) {
  var now = Math.floor(Date.now() / 1000);
  var day = now - 86400;
  var week = now - 604800;
  db('capcodes')
    .select('capcodes.id',
      db.raw('MAX(messages.timestamp) as last_seen'),
      db.raw('COUNT(CASE WHEN messages.timestamp > ' + day + ' THEN 1 END) as count_24h'),
      db.raw('COUNT(CASE WHEN messages.timestamp > ' + week + ' THEN 1 END) as count_7d'))
    .leftJoin('messages', 'capcodes.id', 'messages.alias_id')
    .groupBy('capcodes.id')
    .then(function (rows) { res.status(200).json(rows); })
    .catch(function (err) { logger.main.error(err); res.status(500).send(err); });
});

router.route('/capcodes/:id')
  .get(authHelper.isAdmin, function (req, res, next) {
    var id = req.params.id;
    var defaults = {
      "id": "",
      "address": "",
      "alias": "",
      "agency": "",
      "icon": "question",
      "color": "black",
      "ignore": 0,
      "pluginconf": {},
      "match_type": "address"
    };
    if (id == 'new') {
      res.status(200);
      res.json(defaults);
    } else {
      db.from('capcodes')
        .select('*')
        .where('id', id)
        .then(function (row) {
          if (row.length > 0) {
            row = row[0]
            row.pluginconf = parseJSON(row.pluginconf);
            res.status(200);
            res.json(row);
          } else {
            res.status(200);
            res.json(defaults);
          }
        })
        .catch((err) => {
          logger.main.error(err);
          return next(err);
        })
    }
  })
  .post(authHelper.isAdmin, function (req, res, next) {
    var dbtype = nconf.get('database:type');
    var id = req.params.id || req.body.id || null;
    nconf.load();
    var updateRequired = nconf.get('database:aliasRefreshRequired');
    if (id == 'deleteMultiple') {
      // do delete multiple
      var idList = req.body.deleteList || [0, 0];
      if (!idList.some(isNaN)) {
        logger.main.info('Deleting: ' + idList);
        db.from('capcodes')
          .del()
          .where('id', 'in', idList)
          .then((result) => {
            res.status(200).send({ 'status': 'ok' });
            if (!updateRequired || updateRequired == 0) {
              nconf.set('database:aliasRefreshRequired', 1);
              nconf.save();
            }
          }).catch((err) => {
            res.status(500).send(err);
          })
      } else {
        res.status(500).send({ 'status': 'id list contained non-numbers' });
      }
    } else {
      if (req.body.address && req.body.alias) {
        if (id == 'new') {
          id = null;
        }
        var address = req.body.address || 0;
        var alias = req.body.alias || 'null';
        var agency = req.body.agency || 'null';
        var color = req.body.color || 'black';
        var icon = req.body.icon || 'question';
        var ignore = req.body.ignore || 0;
        var pluginconf = JSON.stringify(req.body.pluginconf) || "{}";
        var updateAlias = req.body.updateAlias || 0;
        var match_type = (req.body.match_type === 'apikey') ? 'apikey' : 'address';

        console.time('insert');
        db.from('capcodes')
          .returning('id')
          .where('id', '=', id)
          .modify(function (queryBuilder) {
            if (id == null) {
              queryBuilder.insert({
                id: id,
                address: address,
                alias: alias,
                agency: agency,
                color: color,
                icon: icon,
                ignore: ignore,
                pluginconf: pluginconf,
                match_type: match_type
              })
            } else {
              queryBuilder.update({
                id: id,
                address: address,
                alias: alias,
                agency: agency,
                color: color,
                icon: icon,
                ignore: ignore,
                pluginconf: pluginconf,
                match_type: match_type
              })
            }
          })
          .then((result) => {
            console.timeEnd('insert');
            if (updateAlias == 1) {
              console.time('updateMap');
              db('messages')
                .update('alias_id', function () {
                  this.select('id')
                    .from('capcodes')
                    .where('messages.address', 'like', address)
                    .modify(function (queryBuilder) {
                      if (dbtype == 'oracledb')
                        queryBuilder.orderByRaw(`REPLACE("address", '_', '%') DESC`);
                      else
                        queryBuilder.orderByRaw(`REPLACE(address, '_', '%') DESC`)
                    })
                    .limit(1)
                })
                .catch((err) => {
                  logger.main.error(err);
                })
                .finally(() => {
                  console.timeEnd('updateMap');
                })
            } else {
              //Check if we can refresh just this specific alias
              var specificRefresh = nconf.get('global:SpecificAliasRefresh');
              if (specificRefresh && /^\d+$/.test(req.body.address)) {
                //Refresh this specific Alias
                console.time('updateMap');
                db('messages').update('alias_id', function () {
                  this.select('id')
                    .from('capcodes')
                    .where(db.ref('messages.address'), 'like', db.ref('capcodes.address'))
                    .modify(function (queryBuilder) {
                      if (dbtype == 'oracledb')
                        queryBuilder.orderByRaw(`REPLACE("address", '_', '%') DESC`);
                      else
                        queryBuilder.orderByRaw(`REPLACE(address, '_', '%') DESC`)
                  })
                  .limit(1)
                })
                .where(db.ref('messages.address'), '=', req.body.address)
                .catch((err) => {
                  logger.main.error(err);
                })
                .finally(() => {
                  console.timeEnd('updateMap');
                })
              } else {
                //We cannot update this specific Alias, so inform of required Alias Refresh
                if (!updateRequired || updateRequired == 0) {
                  nconf.set('database:aliasRefreshRequired', 1);
                  nconf.save();
                }
              }
            }
            res.status(200).send({ 'status': 'ok', 'id': result })
          })
          .catch((err) => {
            console.timeEnd('insert');
            logger.main.error(err)
            res.status(500).send(err);
          })
        logger.main.debug(util.format('%o', req.body || 'request body empty'));
      } else {
        res.status(500).json({ message: 'Error - address or alias missing' });
      }
    }
  })
  .delete(authHelper.isAdmin, function (req, res, next) {
    // delete single alias
    var id = parseInt(req.params.id, 10);
    nconf.load();
    var updateRequired = nconf.get('database:aliasRefreshRequired');
    logger.main.info('Deleting ' + id);
    db.from('capcodes')
      .del()
      .where('id', id)
      .then((result) => {
        res.status(200).send({ 'status': 'ok' });
        if (!updateRequired || updateRequired == 0) {
          nconf.set('database:aliasRefreshRequired', 1);
          nconf.save();
        }
      })
      .catch((err) => {
        res.status(500).send(err);
      })
    logger.main.debug(util.format('%o', req.body || 'request body empty'));
  });

router.route('/capcodeCheck/:id')
  .get(authHelper.isAdmin, function (req, res, next) {
    var id = req.params.id;
    db.from('capcodes')
      .select('*')
      .where('address', id)
      .then((row) => {
        if (row.length > 0) {
          row = row[0]
          row.pluginconf = parseJSON(row.pluginconf);
          res.status(200);
          res.json(row);
        } else {
          row = {
            "id": "",
            "address": "",
            "alias": "",
            "agency": "",
            "icon": "question",
            "color": "black",
            "ignore": 0,
            "pluginconf": {}
          };
          res.status(200);
          res.json(row);
        }
      })
      .catch((err) => {
        logger.main.error(err);
        return next(err);
      })
  });

router.route('/capcodeRefresh')
  .post(authHelper.isAdmin, function (req, res, next) {
    nconf.load();
    var dbtype = nconf.get('database:type');
    console.time('updateMap');
    db('messages').update('alias_id', function () {
      this.select('id')
        .from('capcodes')
        .where(db.ref('messages.address'), 'like', db.ref('capcodes.address'))
        .modify(function (queryBuilder) {
          if (dbtype == 'oracledb')
            queryBuilder.orderByRaw(`REPLACE("address", '_', '%') DESC`);
          else
            queryBuilder.orderByRaw(`REPLACE(address, '_', '%') DESC`)
        })
        .limit(1)
    })
      .then((result) => {
        console.timeEnd('updateMap');
        nconf.set('database:aliasRefreshRequired', 0);
        nconf.save();
        res.status(200).send({ 'status': 'ok' });
      })
      .catch((err) => {
        logger.main.error(err);
        console.timeEnd('updateMap');
      })
  });

router.route('/capcodeExport')
  .post(authHelper.isAdmin, function (req, res, next) {
    nconf.load();
    var dbtype = nconf.get('database:type');
    var filename = 'export.csv'
    db.from('capcodes')
      .select('*')
      .modify(function (queryBuilder) {
        if (dbtype == 'oracledb')
          queryBuilder.orderByRaw(`REPLACE("address", '_', '%')`);
        else
          queryBuilder.orderByRaw(`REPLACE(address, '_', '%')`)
      })
      .then((rows) => {
        converter.json2csv(rows, function (err, data) {
          if (err) {
            res.status(500).send(err);
          } else {
            res.status(200).send({ 'status': 'ok', 'data': data })
          }
        })
      })
      .catch((err) => {
        logger.main.error(err);
        return next(err);
      })
  });

router.route('/capcodeImport')
  .post(authHelper.isAdmin, function (req, res, next) {
    for (var key in req.body) {
      //remove newline chars from dataset - yes i realise we are adding them in admin.main.js, it doesn't submit without them.
      req.body[key] = req.body[key].replace(/[\r\n]/g, '');
    }
    // join data but remove the last newline to prevent the last one being malformed. 
    var importdata = req.body.join('\n').slice(0, -1);
    var importresults = [];
    converter.csv2jsonAsync(importdata)
      .then(async (data) => {
        var header = data[0]
        if (('address' in header) && ('alias' in header)) {
          //this checks if the csv has the required headings, should replace this with some form of proper validation
          for await (capcode of data) {
            var address = capcode.address || 0;
            var alias = capcode.alias || 'null';
            var agency = capcode.agency || 'null';
            var color = capcode.color || 'black';
            var icon = capcode.icon || 'question';
            var ignore = capcode.ignore || 0;
            var pluginconf = JSON.stringify(capcode.pluginconf) || "{}";
            await db('capcodes')
              .returning('id')
              .where('address', '=', address)
              .first()
              .then((rows) => {
                if (rows) {
                  //Update the existing alias if one is found.
                  return db('capcodes')
                    .where('id', '=', rows.id)
                    .update({
                      address: address,
                      alias: alias,
                      agency: agency,
                      color: color,
                      icon: icon,
                      ignore: ignore,
                      pluginconf: pluginconf
                    })
                    .then((result) => {
                      importresults.push({
                        address: address,
                        alias: alias,
                        result: 'updated'
                      })
                    })
                    .catch((err) => {
                      importresults.push({
                        address: address,
                        alias: alias,
                        result: 'failed' + err
                      })
                    })
                } else {
                  //Create new alias if one didn't get returned.
                  return db('capcodes').insert({
                    id: null,
                    address: address,
                    alias: alias,
                    agency: agency,
                    color: color,
                    icon: icon,
                    ignore: ignore,
                    pluginconf: pluginconf
                  })
                    .then((result) => {
                      importresults.push({
                        address: address,
                        alias: alias,
                        result: 'created'
                      })
                    })
                    .catch((err) => {
                      importresults.push({
                        address: address,
                        alias: alias,
                        result: 'failed' + err
                      })
                    })
                }
              })
              .catch((err) => {
                importresults.push({
                  'address': address,
                  'alias': alias,
                  'result': 'failed' + err
                })
              });
          };
          //Gather all the results, format for the frontend and send it back.
          let results = { "results": importresults }
          res.status(200)
          res.json(results)
          logger.main.debug('Import:' + JSON.stringify(importresults))
          nconf.set('database:aliasRefreshRequired', 1);
          nconf.save();
        } else {
          throw 'Error parasing CSV header'
        }
      })
      .catch((err) => {
        res.status(500).send(err)
        logger.main.error(err)
      })
  });

router.route('/user')
  .get(authHelper.isAdmin, function (req, res, next) {
    db.from('users')
      .select('id','givenname','surname','username','email','role','status','lastlogondate')
      .then((rows) => {
        res.json(rows);
      })
      .catch((err) => {
        logger.main.error(err);
        return next(err);
      })
  }) 
  .post(authHelper.isAdmin, function (req, res, next) {
    if (req.body.username && req.body.email && req.body.givenname && req.body.password && req.body.status && req.body.role) {
      var username = req.body.username
      var email = req.body.email
      db.table('users')
        .where('username', '=', username)
        .orWhere('email', '=', email)
        .first()
        .then((row) => {
          if (row) {
            //add logging
            res.status(400).send({ 'status': 'error', 'error': 'Username or Email exists' });
          } else {
            const salt = bcrypt.genSaltSync();
            const hash = bcrypt.hashSync(req.body.password, salt);

            return db('users')
              .insert({
                username: req.body.username,
                password: hash,
                givenname: req.body.givenname,
                surname: req.body.surname,
                email: req.body.email,
                role: req.body.role,
                status: req.body.status,
                lastlogondate: null
              })
              .returning('id')
              .then((response) => {
                //add logging
                logger.main.debug('created user id: ' + response)
                res.status(200).send({ 'status': 'ok', 'id': response[0] });
              })
              .catch((err) => {
                logger.main.error(err)
                res.status(500).send({ 'status': 'error' });
              });
          }
        })
    } else {
      res.status(400).send({ 'status': 'error', 'error': 'Invalid request body' });
    }
  });

router.route('/userCheck/username/:id')
  .get(authHelper.isAdmin, function (req, res, next) {
    var id = req.params.id;
    db.from('users')
      .select('id','givenname','surname','username','email','role','status','lastlogondate')
      .where('username', id)
      .then((row) => {
        if (row.length > 0) {
          row = row[0]
          res.status(200);
          res.json(row);
        } else {
          row = {
            "username": "",
            "password": "",
            "givenname": "",
            "surname": "",
            "email": "",
            "role": "user",
            "status": "active"
          };
          res.status(200);
          res.json(row);
        }
      })
      .catch((err) => {
        logger.main.error(err);
        return next(err);
      })
  });

  router.route('/userCheck/email/:id')
  .get(authHelper.isAdmin, function (req, res, next) {
    var id = req.params.id;
    db.from('users')
      .select('id','givenname','surname','username','email','role','status','lastlogondate')
      .where('email', id)
      .then((row) => {
        if (row.length > 0) {
          row = row[0]
          res.status(200);
          res.json(row);
        } else {
          row = {
            "username": "",
            "password": "",
            "givenname": "",
            "surname": "",
            "email": "",
            "role": "user",
            "status": "active"
          };
          res.status(200);
          res.json(row);
        }
      })
      .catch((err) => {
        logger.main.error(err);
        return next(err);
      })
  });

router.route('/user/:id')
  .get(authHelper.isAdmin, function (req, res, next) {
    var id = req.params.id;
    var defaults = {
      "username": "",
      "password": "",
      "givenname": "",
      "surname": "",
      "email": "",
      "role": "user",
      "status": "active"
    };
    if (id == 'new') {
      res.status(200);
      res.json(defaults);
    } else {
      db.from('users')
        .select('id','givenname','surname','username','email','role','status','lastlogondate')
        .where('id', id)
        .then(function (row) {
          if (row.length > 0) {
            row = row[0]
            res.status(200);
            res.json(row);
          } else {
            res.status(200);
            res.json(defaults);
          }
        })
        .catch((err) => {
          logger.main.error(err);
          return next(err);
        })
    }
  })
  .post(authHelper.isAdmin, function (req, res, next) {
    var id = req.params.id || req.body.id || null;
    if (id == 'deleteMultiple') {
      // do delete multiple
      var idList = req.body.deleteList || [0, 0];
      if (!idList.some(isNaN)) {
        //ADD CHECK TO NOT ALLOW DELETION OF USERID 1
        logger.main.info('Deleting: ' + idList);
        db.from('users')
          .del()
          .where('id', 'in', idList)
          .then((result) => {
            res.status(200).send({ 'status': 'ok' });

          }).catch((err) => {
            res.status(500).send(err);
          })
      } else {
        res.status(400).send({ 'status': 'error', 'error': 'id list contained non-numbers' });
      }
    } else {
      if (req.body.username && req.body.email && req.body.givenname) {
        var password = req.body.newpassword || req.body.password||  null;
        if (id == 'new') {
          // Password is a required field if this is a new account check for that
          if (!req.body.password) {
            return res.status(400).send({'status': 'error', 'error': 'Error - required field missing' });
          } else {
            id = null;
          }
        }
        console.time('insert');
        db.from('users')
          .returning('id')
          .where('id', '=', id)
          .modify(function (queryBuilder) {
            const userobj ={
              id: id,
              username: req.body.username,
              givenname: req.body.givenname,
              surname: req.body.surname || '',
              email: req.body.email,
              role: req.body.role || 'user',
              status: req.body.status || 'disabled',
            }
            if (password != null) {
              const salt = bcrypt.genSaltSync();
              const hash = bcrypt.hashSync(password, salt);
              userobj.password = hash
              if (id == null) {
                userobj.lastlogondate = null
                queryBuilder.insert(userobj)
              } else {
                queryBuilder.update(userobj)
              }
            } else {
              queryBuilder.update(userobj)
            }
          })
          .returning('id')
          .then((result) => {
            console.timeEnd('insert');
            res.status(200).send({ 'status': 'ok', 'id': result[0] })
          })
          .catch((err) => {
            console.timeEnd('insert');
            logger.main.error(err)
            res.status(500).send(err);
          })
      } else {
        res.status(400).send({'status': 'error', 'error': 'Error - required field missing' });
      }
    }
  })
  .delete(authHelper.isAdmin, function (req, res, next) {
    var id = parseInt(req.params.id, 10);
    if (id != 1) {
      logger.main.info('Deleting User ' + id);
      db.from('users')
        .del()
        .where('id', id)
        .then((result) => {
          res.status(200).send({ 'status': 'ok' });
        })
        .catch((err) => {
          res.status(500).send(err);
          logger.main.error(err)
        })
    } else {
      res.status(400).json({ 'error': 'User ID 1 is protected' });
      logger.main.error('Unable to delete user ID 1')
    }
  });

// ── Incident Types CRUD ───────────────────────────────────────────
router.route('/incident-types/refresh')
  .post(authHelper.isAdmin, function (req, res) {
    var parsed = [];
    db('messages').select('message', 'source').then(function (rows) {
      rows.forEach(function (row) {
        var text = row.message || '';
        if (text.indexOf('[TEST RETRIGGER] ') === 0) {
          text = text.substring(18);
        }
        var src = row.source || '';
        var ict = '';
        if (text.indexOf('\n') > 0) {
          var firstLine = text.split('\n')[0].trim();
          ict = firstLine.split('/')[0];
        } else if (text.indexOf('INC:') === 0) {
          var m = text.match(/TYP:(\S+)/);
          if (m) ict = m[1];
        }
        if (ict && parsed.indexOf(ict) < 0) parsed.push(ict);
      });
      var now = Math.floor(Date.now() / 1000);
      var inserts = parsed.map(function (name) {
        var cat = 'Other', col = '#6c757d', letr = 'O';
        var u = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (u === 'WORKINGFIRE' || (u.includes('FIRE') && !u.startsWith('ALARM'))) { cat = 'Fire'; col = '#dc3545'; letr = u.includes('STRUCT') ? 'SF' : u.includes('VEHICL') ? 'VF' : u.includes('MINOR') ? 'MF' : u === 'WORKINGFIRE' ? 'WF' : 'F'; }
        else if (u.startsWith('ALARM')) { cat = 'Alarms'; col = '#6f42c1'; letr = u.slice(5, 7) || 'AL'; }
        else if (u === 'MEDICAL') { cat = 'Medical'; col = '#0d6efd'; letr = 'MED'; }
        else if (u.startsWith('MVC')) { cat = 'Traffic'; col = '#ffc107'; letr = 'MVC'; }
        else if (u === 'RESCUE') { cat = 'Rescue'; col = '#20c997'; letr = 'R'; }
        else if (u.includes('HAZMAT')) { cat = 'HazMat'; col = '#fd7e14'; letr = 'HZ'; }
        else if (u.includes('GAS')) { cat = 'Utilities'; col = '#8b4513'; letr = 'NG'; }
        else if (u === 'ASSIST') { cat = 'Assist'; col = '#17a2b8'; letr = 'A'; }
        else if (u === 'MUTUALAID') { cat = 'Mutual Aid'; col = '#e83e8c'; letr = 'MA'; }
        else if (u === 'ALARMS') { cat = 'Alarms'; col = '#6f42c1'; letr = 'AL'; }
        return { name: name, display_name: name, category: cat, color: col, pin_letter: letr, active: 1, created_at: now };
      });
      if (inserts.length === 0) return res.status(200).json({ status: 'ok', added: 0 });
      var added = 0;
      var remaining = inserts.length;
      inserts.forEach(function (row) {
        db('incident_types').insert(row).then(function () { added++; })
          .catch(function (err) {
            logger.main.error('Geocoder: Type insertion error: ' + err.message);
          })
          .finally(function () {
            remaining--;
            if (remaining === 0) res.status(200).json({ status: 'ok', added: added });
          });
      });
    });
  });

router.post('/incident-types/batch', authHelper.isAdmin, function (req, res) {
  var ids = req.body.ids || [];
  var updates = {};
  if (req.body.category) updates.category = req.body.category;
  if (req.body.color) updates.color = req.body.color;
  if (!ids.length || !Object.keys(updates).length) return res.status(400).json({ error: 'ids and at least one field required' });
  db('incident_types').whereIn('id', ids).update(updates)
    .then(function () { res.status(200).json({ status: 'ok', updated: ids.length }); })
    .catch(function (err) { logger.main.error(err); res.status(500).send(err); });
});

router.route('/incident-types')
  .get(authHelper.isAdmin, function (req, res) {
    db.from('incident_types')
      .select('*')
      .orderBy('category')
      .orderBy('name')
      .then(function (rows) {
        res.status(200).json(rows);
      })
      .catch(function (err) {
        logger.main.error(err);
        res.status(500).send(err);
      });
  })
  .post(authHelper.isAdmin, function (req, res) {
    if (!req.body.name) return res.status(400).json({ error: 'name is required' });
    var id = req.body.id || null;
    var row = {
      name: req.body.name,
      display_name: req.body.display_name || req.body.name,
      category: req.body.category || 'Other',
      color: req.body.color || '#6c757d',
      pin_letter: (req.body.pin_letter || 'O').substring(0, 3),
      active: req.body.active !== undefined ? req.body.active : 1,
    };
    db('incident_types')
      .where('name', row.name)
      .then(function (existing) {
        if (existing.length > 0) {
          return db('incident_types').where('name', row.name).update(row).returning('id');
        } else {
          row.created_at = Math.floor(Date.now() / 1000);
          return db('incident_types').insert(row).returning('id');
        }
      })
      .then(function (result) {
        res.status(200).send({ status: 'ok', id: Array.isArray(result) ? result[0] : result });
      })
      .catch(function (err) {
        logger.main.error(err);
        res.status(500).send(err);
      });
  });

router.route('/incident-types/:id')
  .post(authHelper.isAdmin, function (req, res) {
    if (!req.body.name) return res.status(400).json({ error: 'name is required' });
    db('incident_types')
      .where('id', req.params.id)
      .update({
        name: req.body.name,
        display_name: req.body.display_name || req.body.name,
        category: req.body.category || 'Other',
        color: req.body.color || '#6c757d',
        pin_letter: (req.body.pin_letter || 'O').substring(0, 3),
        active: req.body.active !== undefined ? req.body.active : 1,
      })
      .then(function (updated) {
        if (!updated || updated === 0) return res.status(404).json({ error: 'Not found' });
        res.status(200).json({ status: 'ok' });
      })
      .catch(function (err) {
        logger.main.error(err);
        res.status(500).send(err);
      });
  })
  .delete(authHelper.isAdmin, function (req, res) {
    db('incident_types')
      .where('id', req.params.id)
      .del()
      .then(function () {
        res.status(200).json({ status: 'ok' });
      })
      .catch(function (err) {
        logger.main.error(err);
        res.status(500).send(err);
      });
  });

router.get('/incident-types/map', function (req, res) {
  db.from('incident_types')
    .select('category')
    .min('color as color')
    .min('pin_letter as pin_letter')
    .where('active', 1)
    .groupBy('category')
    .orderBy('category')
    .then(function (rows) {
      res.status(200).json({ categories: rows });
    }).catch(function (err) {
      logger.main.error(err);
      res.status(500).send(err);
    });
});

// ── Agency Location Config CRUD ──────────────────────────────────
router.route('/geo-config')
  .get(authHelper.isAdmin, function (req, res) {
    db.from('agency_location_config')
      .select('*')
      .orderBy('sent_by')
      .orderBy('priority', 'desc')
      .then(function (rows) { res.status(200).json(rows); })
      .catch(function (err) { logger.main.error(err); res.status(500).send(err); });
  })
  .post(authHelper.isAdmin, function (req, res) {
    var id = req.body.id || null;
    var row = {
      sent_by: req.body.sent_by || '',
      alias_pattern: req.body.alias_pattern || null,
      city: req.body.city || '',
      county: req.body.county || '',
      state: req.body.state || '',
      country: req.body.country || 'CA',
      fallback_lat: req.body.fallback_lat || null,
      fallback_lng: req.body.fallback_lng || null,
      bounds_min_lat: req.body.bounds_min_lat || null,
      bounds_max_lat: req.body.bounds_max_lat || null,
      bounds_min_lng: req.body.bounds_min_lng || null,
      bounds_max_lng: req.body.bounds_max_lng || null,
      active: req.body.active !== undefined ? req.body.active : 1,
      priority: req.body.priority || 5,
    };
    if (id) {
      db('agency_location_config').where('id', id).update(row)
        .then(function (updated) {
          if (!updated || updated === 0) return res.status(404).json({ error: 'Not found' });
          res.status(200).json({ status: 'ok', id: id });
        }).catch(function (err) { logger.main.error(err); res.status(500).send(err); });
    } else {
      db('agency_location_config').insert(row).returning('id')
        .then(function (result) { res.status(200).json({ status: 'ok', id: Array.isArray(result) ? result[0] : result }); })
        .catch(function (err) { logger.main.error(err); res.status(500).send(err); });
    }
  });

router.route('/geo-config/:id')
  .get(authHelper.isAdmin, function (req, res) {
    db('agency_location_config').where('id', req.params.id).first()
      .then(function (row) { if (!row) return res.status(404).json({ error: 'Not found' }); res.status(200).json(row); })
      .catch(function (err) { logger.main.error(err); res.status(500).send(err); });
  })
  .delete(authHelper.isAdmin, function (req, res) {
    db('agency_location_config').where('id', req.params.id).del()
      .then(function () { res.status(200).json({ status: 'ok' }); })
      .catch(function (err) { logger.main.error(err); res.status(500).send(err); });
  });

// ── Admin Dashboard Stats ───────────────────────────────────────
router.get('/admin-stats', authHelper.isAdmin, function (req, res) {
  var now = Math.floor(Date.now() / 1000);
  var midnight = Math.floor(new Date().setHours(0,0,0,0) / 1000);
  Promise.all([
    db('pager_calls').count('* as count').where('created_at', '>=', midnight),
    db('messages').count('* as count').where('timestamp', '>=', midnight),
    db('pager_calls').max('created_at as last_geocoded'),
    db('incident_types').count('* as count').where('active', 1),
  ]).then(function (r) {
    res.status(200).json({
      callsToday: parseInt(r[0][0].count) || 0,
      messagesToday: parseInt(r[1][0].count) || 0,
      lastGeocoded: r[2][0].last_geocoded || null,
      activeTypes: parseInt(r[3][0].count) || 0,
    });
  }).catch(function (err) { logger.main.error(err); res.status(500).send(err); });
});

// ── Capcode Stats (last seen + activity) ─────────────────────────
router.use([handleError]);

module.exports = router;

function handleError(err, req, res, next) {
  var output = {
    error: {
      name: err.name,
      message: err.message,
      text: err.toString()
    }
  };
  var statusCode = err.status || 500;
  res.status(statusCode).json(output);
}

function parseJSON(json) {
  var parsed;
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    // ignore errors
  }
  return parsed;
}
