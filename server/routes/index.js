var confFile = './config/config.json';
var path = require('path');
var express = require('express');
var router = express.Router();
var nconf = require('nconf');

nconf.file({ file: confFile });
nconf.load();

const passport = require('../auth/local');

router.use(function (req, res, next) {
    res.locals.login = req.isAuthenticated();
    res.locals.user = req.user || false;
    res.locals.register = nconf.get('auth:registration')
    res.locals.hidecapcode = nconf.get('messages:HideCapcode');
    res.locals.pdwmode = nconf.get('messages:pdwMode');
    res.locals.hidesource = nconf.get('messages:HideSource');
    res.locals.apisecurity = nconf.get('messages:apiSecurity');
    res.locals.iconsize = nconf.get('messages:iconsize');
    res.locals.gaEnable = nconf.get('monitoring:gaEnable');
    res.locals.gaTrackingCode = nconf.get('monitoring:gaTrackingCode');
    res.locals.frontPopupEnable = nconf.get('global:frontPopupEnable');
    res.locals.frontPopupTitle = nconf.get('global:frontPopupTitle');
    res.locals.frontPopupContent = nconf.get('global:frontPopupContent');
    res.locals.searchLocation = nconf.get('global:searchLocation');
    res.locals.monitorName = nconf.get("global:monitorName");
    res.locals.faKey = nconf.get("global:faKey");
    next();
});

function serveVueApp(req, res) {
    var theme = nconf.get('global:theme') || 'default';
    var htmlPath = path.join(__dirname, '..', 'themes', theme, 'public', 'dist', 'index.html');
    res.sendFile(htmlPath, function (err) {
        if (err) {
            res.status(503).send('App not built yet. Run: cd themes/default/vue-client && npm install && npm run build');
        }
    });
}

/* GET home page. */
router.get('/', function (req, res, next) {
    if (nconf.get('messages:apiSecurity') && !req.isAuthenticated()) {
        return res.redirect('/auth/login');
    }
    serveVueApp(req, res);
});

/* Live-log viewer page (Vue route — SPA handles client-side routing) */
router.get('/livelog', function (req, res) {
    if (!req.isAuthenticated()) {
        return res.redirect('/auth/login');
    }
    serveVueApp(req, res);
});

router.get('/favicon.ico', function (req, res) { res.status(204).end(); });

module.exports = router;
