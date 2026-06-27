var express = require('express');
var bodyParser = require('body-parser');
var path = require('path');
var router = express.Router();
var bcrypt = require('bcryptjs');
var fs = require('fs');
var logger = require('../log');
var util = require('util');
var passport = require('../auth/local'); // pass passport for configuration
const authHelper = require('../middleware/authhelper')

router.use(function (req, res, next) {
    res.locals.login = req.isAuthenticated();
    res.locals.user = req.user;
    res.locals.monitorName = nconf.get("global:monitorName");
    next();
});

var nconf = require('nconf');
var confFile = './config/config.json';
var conf_backup = './config/backup.json';

nconf.file({ file: confFile });
nconf.load();

router.use(bodyParser.json());       // to support JSON-encoded bodies
router.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true
}));

// Fields that must never be overwritten via the settings API
const PROTECTED_FIELDS = ['encPass', 'sessionSecret'];

function sanitizeSettings(settings) {
    // Return a shallow copy without sensitive fields
    let safe = { ...settings };
    if (safe.auth) {
        safe.auth = { ...safe.auth };
        delete safe.auth.encPass;
        if (Array.isArray(safe.auth.keys)) {
            safe.auth.keys = safe.auth.keys.map(k => ({
                name: k.name || '', key: '', selected: k.selected || false
            }));
        }
    }
    if (safe.global) {
        safe.global = { ...safe.global };
        delete safe.global.sessionSecret;
    }
    return safe;
}

function mergeSettings(current, incoming) {
    // Deep merge that preserves protected fields
    let merged = JSON.parse(JSON.stringify(current));
    
    for (let section in incoming) {
        if (!merged[section]) merged[section] = {};
        if (typeof incoming[section] === 'object' && !Array.isArray(incoming[section])) {
            for (let key in incoming[section]) {
                if (section === 'auth' && key === 'keys' && Array.isArray(incoming.auth.keys)) {
                    const curKeys = Array.isArray(merged.auth.keys) ? merged.auth.keys : [];
                    merged.auth.keys = incoming.auth.keys.map(ink => {
                        if (ink.key) return { ...ink };
                        const match = curKeys.find(ck => ck.name === ink.name);
                        if (match) return { ...ink, key: match.key, selected: match.selected };
                        return null;
                    }).filter(Boolean);
                    continue;
                }
                if (section === 'auth' && PROTECTED_FIELDS.includes(key)) {
                    continue; // skip protected auth fields
                }
                if (section === 'global' && PROTECTED_FIELDS.includes(key)) {
                    continue; // skip protected global fields
                }
                merged[section][key] = incoming[section][key];
            }
        } else {
            merged[section] = incoming[section];
        }
    }
    return merged;
}

router.route('/settingsData')
    .get(authHelper.isAdmin, function (req, res, next) {
        nconf.load();
        let settings = nconf.get();
        // logger.main.debug(util.format('Config:\n\n%o',settings));
        let plugins = [];
        fs.readdirSync('./plugins').forEach(file => {
            if (file.endsWith('.json')) {
                let pConf = require(`../plugins/${file}`);
                if (!pConf.disable)
                    plugins.push(pConf);
            }
        });
        let themes = [];
        fs.readdirSync('./themes').forEach(file => {
            themes.push(file)
        });
        // logger.main.debug(util.format('Plugin Config:\n\n%o',plugins));
        let data = { "settings": sanitizeSettings(settings), "plugins": plugins, "themes": themes }
        res.json(data);
    })
    .post(authHelper.isAdmin, function (req, res, next) {
        nconf.load();
        if (req.body && typeof req.body === 'object') {
            var currentConfig = nconf.get();
            var merged = mergeSettings(currentConfig, req.body);
            fs.writeFileSync(conf_backup, JSON.stringify(currentConfig, null, 2));
            fs.writeFileSync(confFile, JSON.stringify(merged, null, 2));
            nconf.load();
            res.status(200).send({ 'status': 'ok' });
        } else {
            res.status(400).send({ error: 'request body empty' });
        }
    });

router.get('*', authHelper.isAdminGUI, function (req, res, next) {
    var theme = nconf.get('global:theme') || 'default';
    var htmlPath = path.join(__dirname, '..', 'themes', theme, 'public', 'dist', 'index.html');
    res.sendFile(htmlPath, function (err) {
        if (err) res.status(503).send('App not built yet.');
    });
});

module.exports = router;
