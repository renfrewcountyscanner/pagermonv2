var DEFAULT_CENTER = window.MAP_CENTER || [45.42, -75.70];
var DEFAULT_ZOOM = 10;
var REFRESH_INTERVAL = 30000;
var AUTO_FIT_DELAY_MS = 120000;

var categoryColors = {};
var categoryLetters = {};

var map;
var markersLayer;
var heatLayer;
var currentCalls = [];
var visibleCalls = [];
var callMarkers = new Map();
var isHeatmap = false;
var isDarkTheme = true;
var socket;
var audioCtx;
var lastCallId = 0;
var selectedCallId = null;
var isMuted = false;
var isLiveFeed = false;
var autoFitTimer = null;
var desktopNotifEnabled = false;
var notifUnreadCount = 0;
var notifList = [];
var testCallId = -1;
var pendingPermalinkCallId = null;
var permalinkHandled = false;

function init() {
    initAudioContext();
    loadCategoryConfig().then(function() {
        initMap();
        initSocket();
        initControls();
        initNotifications();
        initDesktopNotifications();
        loadCalls();
    });
}

function loadCategoryConfig() {
    return fetch('/api/incident-types/map')
        .then(function(r) { return r.json(); })
        .then(function(d) {
            if (d.categories) {
                d.categories.forEach(function(c) {
                    categoryColors[c.category] = c.color;
                    categoryLetters[c.category] = c.pin_letter;
                });
            }
            renderCategoryFilters(d.categories || []);
            renderLegend(d.categories || []);
        })
        .catch(function() {});
}

function initAudioContext() {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
}

function playNotificationSound() {
    if (isMuted || !audioCtx) return;
    try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc.start(); osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {}
}

function initMap() {
    map = L.map('map', { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    addDarkTiles();
    markersLayer = L.layerGroup().addTo(map);
    heatLayer = L.heatLayer([], { radius: 25, blur: 15, maxZoom: 14, gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1: 'red' } });
}

function addDarkTiles() {
    document.getElementById('map').classList.add('dark-tiles');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors', maxZoom: 20
    }).addTo(map);
}

function addLightTiles() {
    document.getElementById('map').classList.remove('dark-tiles');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors', maxZoom: 20
    }).addTo(map);
}

function localMidnightEpoch() {
    var timeZone = window.MAP_TIMEZONE || 'America/Toronto';
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    var y = parts.find(function(p) { return p.type === 'year'; }).value;
    var m = parts.find(function(p) { return p.type === 'month'; }).value;
    var d = parts.find(function(p) { return p.type === 'day'; }).value;
    var tempDate = new Date(y + '-' + m + '-' + d + 'T00:00:00Z');
    var localStr = tempDate.toLocaleString('en-US', { timeZone: timeZone });
    var utcStr = tempDate.toLocaleString('en-US', { timeZone: 'UTC' });
    var offsetMs = new Date(utcStr).getTime() - new Date(localStr).getTime();
    return Math.floor((tempDate.getTime() + offsetMs) / 1000);
}

function initSocket() {
    socket = io({ transports: ['websocket', 'polling'] });
    socket.on('connect', function() {
        setLiveStatus('ONLINE');
        loadCalls();
        emitSubscribe();
    });
    socket.on('disconnect', function() { setLiveStatus('OFFLINE'); });
    socket.on('new_calls', function(payload) {
        if (payload.calls && payload.calls.length) handleNewCalls(payload.calls);
    });
}

function emitSubscribe() {
    var tr = document.getElementById('timeRange');
    var sub = {};
    if (tr.value === 'custom') {
        var df = document.getElementById('dateFrom').value;
        var dt = document.getElementById('dateTo').value;
        if (df) sub.from = Math.floor(new Date(df + 'T00:00').getTime() / 1000);
        if (dt) sub.to = Math.floor(new Date(dt + 'T23:59:59').getTime() / 1000);
        if (!sub.from && !sub.to) sub.hours = 24;
    } else if (tr.value === 'midnight') {
        sub.from = localMidnightEpoch();
    } else {
        sub.hours = parseFloat(tr.value);
    }
    socket.emit('subscribe', sub);
}

function setLiveStatus(status) {
    var badge = document.getElementById('liveToggle');
    var text = document.getElementById('liveText');
    text.textContent = status;
    badge.classList.remove('online', 'offline');
    if (status === 'ONLINE') badge.classList.add('online');
    else badge.classList.add('offline');
}

function loadCalls() {
    var tr = document.getElementById('timeRange');
    var params = new URLSearchParams();
    if (tr.value === 'custom') {
        var df = document.getElementById('dateFrom').value;
        var dt = document.getElementById('dateTo').value;
        if (df) params.append('from', Math.floor(new Date(df + 'T00:00').getTime() / 1000));
        if (dt) params.append('to', Math.floor(new Date(dt + 'T23:59:59').getTime() / 1000));
        if (!df && !dt) params.append('hours', '24');
    } else if (tr.value === 'midnight') {
        params.append('from', localMidnightEpoch());
    } else {
        params.append('hours', tr.value);
    }
    var activeCats = getActiveCategories();
    if (activeCats.length > 0) params.append('category', activeCats.join(','));

    fetch('/api/calls?' + params.toString())
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) {
                currentCalls = data.result || [];
                renderSourceFilter();
                updateLastCallId();
                if (pendingPermalinkCallId != null) {
                    console.log('[pagermon] loadCalls: permalink pending, skipFitBounds, handled:', permalinkHandled);
                    applyFilters(true);
                    if (!permalinkHandled) {
                        handlePermalink(pendingPermalinkCallId);
                        permalinkHandled = true;
                    }
                } else {
                    applyFilters();
                }
            }
        }).catch(function(err) { console.error('Failed to load calls:', err); });
}

function updateLastCallId() {
    if (currentCalls.length) {
        lastCallId = Math.max(lastCallId, currentCalls.reduce(function(m, c) { return Math.max(m, c.call_id); }, 0));
    }
}

function getActiveCategories() {
    var cats = [];
    document.querySelectorAll('.cat-filter:checked').forEach(function(cb) { cats.push(cb.value); });
    return cats;
}

function applyFilters(skipFitBounds) {
    var activeCats = new Set(getActiveCategories());
    var sourceFilter = document.getElementById('sourceFilter').value;
    var fromEpoch = null;
    var toEpoch = null;
    if (!isLiveFeed && document.getElementById('timeRange').value === 'custom') {
        var df = document.getElementById('dateFrom').value;
        var dt = document.getElementById('dateTo').value;
        if (df) fromEpoch = Math.floor(new Date(df + 'T00:00').getTime() / 1000);
        if (dt) toEpoch = Math.floor(new Date(dt + 'T23:59:59').getTime() / 1000);
    }
    function passes(c) {
        var cat = c.category || 'Other';
        if (activeCats.size > 0 && !activeCats.has(cat)) return false;
        if (sourceFilter && c.sent_by !== sourceFilter) return false;
        if (fromEpoch && c.timestamp < fromEpoch) return false;
        if (toEpoch && c.timestamp > toEpoch) return false;
        return true;
    }
    if (isLiveFeed) {
        var filtered = currentCalls.filter(passes);
        visibleCalls = filtered.length > 0 ? [filtered[0]] : [];
    } else {
        visibleCalls = currentCalls.filter(passes);
    }
    renderMarkers();
    renderCallList();
    updateStats();
    updateTicker();
    if (!isLiveFeed && !skipFitBounds) fitBounds();
}

function renderSourceFilter() {
    var select = document.getElementById('sourceFilter');
    if (!select) return;
    var selected = select.value;
    var sources = Array.from(new Set(currentCalls.map(function(c) { return c.sent_by; }).filter(Boolean))).sort();
    select.innerHTML = '<option value="">All sources</option>' + sources.map(function(source) {
        return '<option value="' + esc(source) + '">' + esc(source) + '</option>';
    }).join('');
    select.value = sources.indexOf(selected) >= 0 ? selected : '';
}

function renderCallList() {
    var items = document.getElementById('callListItems');
    var count = document.getElementById('callListCount');
    if (!items || !count) return;
    count.textContent = visibleCalls.length;
    var calls = visibleCalls.slice().sort(function(a, b) { return b.timestamp - a.timestamp; }).slice(0, 12);
    if (!calls.length) {
        items.innerHTML = '<div class="call-list-empty">No calls match the current filters.</div>';
        return;
    }
    items.innerHTML = calls.map(function(call) {
        return '<button class="call-list-item" data-call-id="' + call.call_id + '">' +
          '<span class="call-list-dot" style="background:' + esc(call.color || '#6c757d') + '"></span>' +
          '<span class="call-list-copy"><strong>' + esc(call.incident_type || call.category || 'Call') + '</strong><small>' + esc(call.address || 'No location') + '</small></span>' +
          '<time>' + esc(formatTime(call.timestamp)) + '</time></button>';
    }).join('');
    items.querySelectorAll('[data-call-id]').forEach(function(button) {
        button.addEventListener('click', function() {
            var call = visibleCalls.find(function(c) { return String(c.call_id) === button.dataset.callId; });
            if (!call) return;
            showCallDetail(call);
            panToCall(call);
        });
    });
}

function renderMarkers() {
    markersLayer.clearLayers();
    callMarkers.clear();
    var heatPoints = [];
    var latestCall = null;
    var latestTs = 0;
    visibleCalls.forEach(function(c) {
        if (c.timestamp > latestTs) { latestTs = c.timestamp; latestCall = c; }
    });
    visibleCalls.forEach(function(call) {
        if (!call.lat || !call.lng) return;
        var color = call.color || '#6c757d';
        var letter = call.pin_letter || 'O';
        var tr = document.getElementById('timeRange');
        var opacity = 1.0;
        var isTest = call.call_id < 0;
        var isLatest = latestCall && call.call_id === latestCall.call_id;
        var latestClass = isLatest ? ' latest-marker' : '';
        var markerHtml = '<div class="custom-marker' + latestClass + '" style="background:' + color + ';opacity:' + opacity + ';border-color:' + color + '"><span>' + esc(letter) + '</span></div>';
        var icon = L.divIcon({ className: '', html: markerHtml, iconSize: [28, 28], iconAnchor: [14, 28] });
        var marker = L.marker([call.lat, call.lng], { icon: icon }).addTo(markersLayer);
        var popupContent = '<div style="min-width:160px"><div style="font-weight:600;margin-bottom:0.3rem">' + esc(call.incident_type || call.category || 'Call') + '</div><div style="font-size:0.8rem;color:#aaa;margin-bottom:0.3rem">' + esc(call.address || '—') + '</div><div style="font-size:0.75rem;color:#888">' + formatTime(call.timestamp) + '</div><div style="font-size:0.75rem;color:#888">' + esc(call.sent_by || '') + '</div></div>';
        marker.bindPopup(popupContent);
        marker.on('click', function() {
            updateUrlHash(call.call_id);
            showCallDetail(call);
        });
        callMarkers.set(call.call_id, marker);
        heatPoints.push([call.lat, call.lng, 0.6]);
    });
    heatLayer.setLatLngs(heatPoints);
}

function panToCall(call) {
    if (!call.lat || !call.lng) return;
    map.flyTo([call.lat, call.lng], 17, { duration: 1.5 });
    if (isLiveFeed) { cancelAutoFit(); return; }
    showAutoFitCountdown();
    if (autoFitTimer) clearTimeout(autoFitTimer);
    autoFitTimer = setTimeout(function() { hideAutoFitCountdown(); closeSidebar(); fitBounds(); autoFitTimer = null; }, AUTO_FIT_DELAY_MS);
}

function showAutoFitCountdown() {
    var el = document.getElementById('autoFitCountdown');
    el.classList.remove('d-none');
    var remaining = AUTO_FIT_DELAY_MS / 1000;
    function update() {
        var min = Math.floor(remaining / 60);
        var sec = String(remaining % 60).padStart(2, '0');
        document.getElementById('countdownText').textContent = 'Auto-fit in ' + min + ':' + sec;
    }
    update();
    if (el._interval) clearInterval(el._interval);
    el._interval = setInterval(function() { remaining--; update(); if (remaining <= 0) { clearInterval(el._interval); el._interval = null; } }, 1000);
}

function hideAutoFitCountdown() {
    var el = document.getElementById('autoFitCountdown');
    el.classList.add('d-none');
    if (el._interval) { clearInterval(el._interval); el._interval = null; }
}

function cancelAutoFit() {
    if (autoFitTimer) { clearTimeout(autoFitTimer); autoFitTimer = null; }
    hideAutoFitCountdown();
}

function handleNewCalls(calls) {
    var added = 0;
    var updated = 0;
    var locationAdded = 0;
    var newArrivals = [];
    calls.forEach(function(call) {
        var idx = currentCalls.findIndex(function(c) { return c.call_id === call.call_id; });
        if (idx >= 0) {
            var hadLocation = !!(currentCalls[idx].lat && currentCalls[idx].lng);
            currentCalls[idx] = call;
            updated++;
            if (!hadLocation && call.lat && call.lng) locationAdded++;
        } else if (call.call_id > lastCallId) {
            currentCalls.unshift(call);
            lastCallId = Math.max(lastCallId, call.call_id);
            added++;
            newArrivals.push(call);
        }
    });
    if (currentCalls.length > 2000) currentCalls = currentCalls.slice(0, 2000);
    if (added > 0 || updated > 0) {
        newArrivals.forEach(function(c) { addNotification(c); });
        if (added > 0 || locationAdded > 0) applyFilters();
        else applyFilters(true);
        updateStats();
        updateTicker();
        if (isLiveFeed) {
            var newest = visibleCalls[0];
            if (newest) { panToCall(newest); showCallDetail(newest); }
        } else if (added > 0 || locationAdded > 0) {
            var n = calls[0];
            if (n) { panToCall(n); showCallDetail(n); }
        }
        if (added > 0) { playNotificationSound(); sendDesktopNotifications(newArrivals); }
    }
}

function initNotifications() {
    document.getElementById('notifToggle').addEventListener('click', toggleNotifPanel);
    document.getElementById('closeNotifPanel').addEventListener('click', function() { document.getElementById('notifPanel').classList.remove('open'); });
    document.getElementById('clearNotifs').addEventListener('click', clearAllNotifications);
}

function toggleNotifPanel() {
    document.getElementById('notifPanel').classList.toggle('open');
    notifUnreadCount = 0;
    updateNotifBadge();
    notifList.forEach(function(n) { n.read = true; });
    renderNotifications();
}

function addNotification(call) {
    notifList.unshift({ call_id: call.call_id, timestamp: call.timestamp, incident: call.incident_type || 'Call', address: call.address || '—', sent_by: call.sent_by || '', color: call.color || '#6c757d', read: false });
    if (notifList.length > 50) notifList = notifList.slice(0, 50);
    notifUnreadCount++;
    updateNotifBadge();
    renderNotifications();
}

function updateNotifBadge() {
    var badge = document.getElementById('notifBadge');
    if (notifUnreadCount > 0) { badge.textContent = notifUnreadCount > 99 ? '99+' : notifUnreadCount; badge.classList.remove('d-none'); }
    else { badge.classList.add('d-none'); }
}

function renderNotifications() {
    var container = document.getElementById('notifList');
    if (!notifList.length) { container.innerHTML = '<div class="notif-empty">No new calls yet</div>'; return; }
    container.innerHTML = notifList.map(function(n) {
        var unreadClass = n.read ? '' : 'unread';
        return '<div class="notif-item ' + unreadClass + '" data-id="' + n.call_id + '"><div class="notif-meta"><span class="notif-time">' + formatTime(n.timestamp) + '</span><span class="notif-inc" style="background:' + n.color + '">' + esc(n.incident) + '</span></div><div class="notif-addr">' + esc(n.address) + '</div><div class="notif-sys">' + esc(n.sent_by) + '</div></div>';
    }).join('');
    container.querySelectorAll('.notif-item').forEach(function(el) {
        el.addEventListener('click', function() {
            var callId = Number(el.dataset.id);
            var call = currentCalls.find(function(c) { return c.call_id === callId; });
            if (call) { updateUrlHash(call.call_id); showCallDetail(call); if (call.lat && call.lng) map.flyTo([call.lat, call.lng], 16); }
        });
    });
}

function clearAllNotifications() { notifList = []; notifUnreadCount = 0; updateNotifBadge(); renderNotifications(); }

function initDesktopNotifications() {
    if (!('Notification' in window)) return;
    var request = function() {
        if (Notification.permission === 'default') Notification.requestPermission().then(function(p) { if (p === 'granted') desktopNotifEnabled = true; });
        else if (Notification.permission === 'granted') desktopNotifEnabled = true;
        document.removeEventListener('click', request);
    };
    document.addEventListener('click', request, { once: true });
}

function sendDesktopNotifications(calls) {
    if (!desktopNotifEnabled || Notification.permission !== 'granted') return;
    calls.forEach(function(call) {
        try {
            new Notification((call.incident_type || 'Call') + ' Call', { body: (call.address || '—') + ' — ' + (call.sent_by || ''), tag: String(call.call_id) });
        } catch (e) {}
    });
}

function showCallDetail(call) {
    selectedCallId = call.call_id;
    var sidebar = document.getElementById('sidebar');
    var content = document.getElementById('sidebarContent');
    var inc = call.incident_type || call.category || 'Other';
    var color = call.color || '#6c757d';
    content.innerHTML = '<div class="call-detail"><div class="detail-header"><div class="detail-id">Call #' + call.call_id + '</div><div class="detail-time">' + formatTime(call.timestamp) + ' <span style="color:#888">(' + timeAgo(call.timestamp) + ')</span></div><div><span class="detail-badge" style="background:' + color + '20;color:' + color + '">' + esc(inc) + '</span>' + (call.call_id < 0 ? '<span class="detail-badge" style="background:rgba(255,193,7,0.2);color:#ffc107">TEST</span>' : '') + '</div></div><div class="detail-section"><div class="section-label">Address</div><div class="section-value">' + esc(call.address || '—') + '</div></div><div class="detail-section"><div class="section-label">Source</div><div class="section-value">' + esc(call.sent_by || '—') + '</div></div><div class="detail-section"><div class="section-label">Station / Alias</div><div class="section-value">' + esc(call.alias || '—') + '</div></div>' + (call.cross_streets ? '<div class="detail-section"><div class="section-label">Cross Streets</div><div class="section-value">' + esc(call.cross_streets) + '</div></div>' : '') + '<div class="detail-section"><div class="section-label">Raw Message</div><div class="transcript-box">' + esc(call.raw_text || 'No message text.') + '</div></div><div class="share-row"><button onclick="copyPermalink(' + call.call_id + ')"><i class="bi bi-link-45deg"></i> Copy Link</button></div></div>';
    sidebar.classList.add('open');
}

function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); selectedCallId = null; updateUrlHash(null); }

function updateUrlHash(callId) {
    if (callId) history.replaceState(null, '', '?call=' + callId);
    else history.replaceState(null, '', window.location.pathname);
}

function copyPermalink(callId) {
    var url = window.location.origin + '?call=' + callId;
    navigator.clipboard.writeText(url).then(function() { showToastMsg('Link copied', 'success'); }).catch(function() { showToastMsg('Failed to copy', 'danger'); });
}

function handlePermalink(callId) {
    console.log('[pagermon] handlePermalink called with callId:', callId, 'map:', !!map, 'currentCalls:', currentCalls.length);
    var call = currentCalls.find(function(c) { return c.call_id === callId; });
    if (call) {
        console.log('[pagermon] Found in currentCalls, has lat/lng:', !!call.lat, !!call.lng, 'zoom to:', call.lat, call.lng);
        showCallDetail(call);
        if (call.lat && call.lng) map.setView([call.lat, call.lng], 16);
        return;
    }
    console.log('[pagermon] Not in currentCalls, fetching from API...');
    fetch('/api/calls/' + callId).then(function(r) { return r.json(); }).then(function(d) {
        if (d.success) { console.log('[pagermon] API fetch success, setView'); showCallDetail(d.result); if (d.result.lat && d.result.lng) map.setView([d.result.lat, d.result.lng], 16); }
    }).catch(function(err) { console.error('[pagermon] API fetch failed:', err); });
}

function showToastMsg(message, type) {
    var toast = document.createElement('div');
    toast.className = 'toast-item';
    if (type === 'success') toast.style.borderLeftColor = '#198754';
    if (type === 'danger') toast.style.borderLeftColor = '#dc3545';
    if (type === 'warning') toast.style.borderLeftColor = '#ffc107';
    toast.innerHTML = '<div>' + esc(message) + '</div>';
    document.getElementById('toastContainer').appendChild(toast);
    setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 5000);
}

function updateStats() {
    var total = visibleCalls.length;
    var byCat = {};
    visibleCalls.forEach(function(c) { var cat = c.category || 'Other'; byCat[cat] = (byCat[cat] || 0) + 1; });
    document.getElementById('statTotal').textContent = total;
    var catDiv = document.getElementById('statCategories');
    catDiv.innerHTML = Object.entries(byCat).sort(function(a, b) { return b[1] - a[1]; }).map(function(e) {
        var color = categoryColors[e[0]] || '#6c757d';
        return '<div class="stat-row"><span class="stat-label"><span class="legend-dot" style="background:' + color + ';display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;"></span>' + esc(e[0]) + '</span><span class="stat-value">' + e[1] + '</span></div>';
    }).join('');
}

function updateTicker() {
    var container = document.getElementById('tickerContent');
    var recent = visibleCalls.slice(0, 15);
    if (!recent.length) { container.innerHTML = '<span class="ticker-item">No recent calls</span>'; return; }
    container.innerHTML = recent.map(function(c) {
        var color = c.color || '#6c757d';
        return '<span class="ticker-item"><span class="t-time">' + formatTime(c.timestamp).split(' ')[1] + '</span><span class="t-type" style="color:' + color + '">' + esc(c.incident_type || c.category || '') + '</span><span>' + esc((c.address || '—').substring(0, 30)) + '</span></span>';
    }).join('');
}

function fitBounds() {
    var points = visibleCalls.filter(function(c) { return c.lat && c.lng; }).map(function(c) { return [c.lat, c.lng]; });
    if (!points.length) { map.setView(DEFAULT_CENTER, DEFAULT_ZOOM); return; }
    if (points.length === 1) { map.setView(points[0], 12); return; }
    map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 14, minZoom: 9 });
}

function renderCategoryFilters(categories) {
    var bar = document.getElementById('categoryBar');
    bar.innerHTML = categories.map(function(c) {
        return '<label><input type="checkbox" class="cat-filter" value="' + esc(c.category) + '" checked><span class="dot" style="background:' + c.color + '"></span> ' + esc(c.category) + '</label>';
    }).join('');
    document.querySelectorAll('.cat-filter').forEach(function(cb) { cb.addEventListener('change', function() { applyFilters(); }); });
}

function renderLegend(categories) {
    var el = document.getElementById('legendItems');
    el.innerHTML = categories.map(function(c) {
        return '<div class="legend-item"><span class="legend-dot" style="background:' + c.color + ';display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:6px;vertical-align:middle;border:2px solid #fff;"></span> ' + esc(c.category) + ' <span style="color:#888;font-size:0.7rem;">(' + (c.pin_letter || 'O') + ')</span></div>';
    }).join('');
}

function initControls() {
    document.getElementById('timeRange').addEventListener('change', function() {
        var wrap = document.getElementById('customDateWrap');
        if (this.value === 'custom') wrap.classList.remove('d-none');
        else { wrap.classList.add('d-none'); loadCalls(); emitSubscribe(); }
    });
    document.getElementById('customDateApply').addEventListener('click', function() { loadCalls(); emitSubscribe(); });
    document.getElementById('sourceFilter').addEventListener('change', function() { applyFilters(true); });
    document.getElementById('closeSidebar').addEventListener('click', closeSidebar);
    document.getElementById('fitBoundsBtn').addEventListener('click', fitBounds);
    document.getElementById('cancelAutoFit').addEventListener('click', cancelAutoFit);
    document.getElementById('fullscreenBtn').addEventListener('click', function() { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); });
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    document.getElementById('heatmapToggle').addEventListener('click', toggleHeatmap);
    document.getElementById('muteToggle').addEventListener('click', toggleMute);
    document.getElementById('liveFeedToggle').addEventListener('click', toggleLiveFeed);
    document.getElementById('testBtn').addEventListener('click', injectTestCall);
    document.getElementById('helpBtn').addEventListener('click', toggleHelpModal);
    document.getElementById('searchAddressBtn').addEventListener('click', searchAddress);
    document.getElementById('myLocationBtn').addEventListener('click', function() {
        if (navigator.geolocation) { navigator.geolocation.getCurrentPosition(function(p) { map.setView([p.coords.latitude, p.coords.longitude], 14); }, function() { showToastMsg('Location access denied', 'danger'); }); }
    });
    document.getElementById('tickerToggle') && document.getElementById('tickerToggle').addEventListener('click', function() { document.getElementById('tickerBar').classList.toggle('hidden'); });
    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('visibilitychange', function() { if (!document.hidden && socket && socket.connected) loadCalls(); });
    setInterval(function() { if (!socket || !socket.connected) loadCalls(); }, REFRESH_INTERVAL);

    var params = new URLSearchParams(window.location.search);
    var callId = params.get('call');
    if (callId) {
        pendingPermalinkCallId = parseInt(callId, 10);
        console.log('[pagermon] initControls: set pendingPermalinkCallId =', pendingPermalinkCallId);
    }
}

function handleKeydown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    switch (e.key) {
        case '?': e.preventDefault(); toggleHelpModal(); break;
        case 'Escape': closeSidebar(); document.getElementById('notifPanel').classList.remove('open'); break;
        case 'f': case 'F': e.preventDefault(); fitBounds(); cancelAutoFit(); break;
        case 'm': case 'M': e.preventDefault(); toggleMute(); break;
        case 'l': case 'L': e.preventDefault(); toggleLiveFeed(); break;
        case 'n': case 'N': e.preventDefault(); toggleNotifPanel(); break;
        case 't': case 'T': e.preventDefault(); injectTestCall(); break;
    }
}

function toggleTheme() {
    isDarkTheme = !isDarkTheme;
    map.eachLayer(function(layer) { if (layer instanceof L.TileLayer) map.removeLayer(layer); });
    if (isDarkTheme) addDarkTiles(); else addLightTiles();
    localStorage.setItem('mapTheme', isDarkTheme ? 'dark' : 'light');
}

function toggleHeatmap() {
    isHeatmap = !isHeatmap;
    var btn = document.getElementById('heatmapToggle');
    if (isHeatmap) { btn.classList.add('active'); map.removeLayer(markersLayer); heatLayer.addTo(map); }
    else { btn.classList.remove('active'); map.removeLayer(heatLayer); markersLayer.addTo(map); }
}

function toggleMute() {
    isMuted = !isMuted;
    var btn = document.getElementById('muteToggle');
    if (isMuted) { btn.innerHTML = '<i class="bi bi-volume-mute-fill"></i>'; btn.title = 'Unmute'; }
    else { btn.innerHTML = '<i class="bi bi-volume-up-fill"></i>'; btn.title = 'Mute'; if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); }
    localStorage.setItem('mapMuted', isMuted ? '1' : '0');
}

function toggleLiveFeed() {
    isLiveFeed = !isLiveFeed;
    var btn = document.getElementById('liveFeedToggle');
    var label = document.getElementById('liveFeedLabel');
    var badge = document.getElementById('liveFeedBadge');
    if (isLiveFeed) { btn.classList.add('active-danger'); label.textContent = 'Live Feed'; badge.classList.remove('d-none'); document.getElementById('timeRange').disabled = true; }
    else { btn.classList.remove('active-danger'); label.textContent = 'All Calls'; badge.classList.add('d-none'); document.getElementById('timeRange').disabled = false; }
    applyFilters();
    if (!isLiveFeed) fitBounds();
}

function injectTestCall() {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    testCallId--;
    var lat = DEFAULT_CENTER[0] + (Math.random() - 0.5) * 0.5;
    var lng = DEFAULT_CENTER[1] + (Math.random() - 0.5) * 0.8;
    var now = Math.floor(Date.now() / 1000);
    var testCall = { call_id: testCallId, timestamp: now, datetime: new Date(now * 1000).toLocaleString(), incident_type: 'Fire', category: 'Fire', color: '#dc3545', pin_letter: 'F', lat: lat, lng: lng, address: '123 Test Street, Ottawa, ON', sent_by: 'TEST', alias: 'TEST', cross_streets: '', raw_text: 'This is a TEST call for the PagerMon mapping system.', has_location: true };
    currentCalls.unshift(testCall);
    if (currentCalls.length > 2000) currentCalls = currentCalls.slice(0, 2000);
    addNotification(testCall);
    if (isLiveFeed) { applyFilters(); panToCall(testCall); showCallDetail(testCall); }
    else { applyFilters(); panToCall(testCall); }
    playNotificationSound();
    setTimeout(function() {
        var idx = currentCalls.findIndex(function(c) { return c.call_id === testCallId; });
        if (idx >= 0) { currentCalls.splice(idx, 1); applyFilters(); if (selectedCallId === testCallId) closeSidebar(); }
    }, 30000);
}

function searchAddress() {
    var q = prompt('Search for an address or location:');
    if (!q) return;
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q))
        .then(function(r) { return r.json(); })
        .then(function(results) { if (results && results.length) map.setView([parseFloat(results[0].lat), parseFloat(results[0].lon)], 16); else showToastMsg('Address not found', 'warning'); })
        .catch(function() { showToastMsg('Search failed', 'danger'); });
}

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function formatTime(epoch) { if (!epoch) return '—'; return new Date(epoch * 1000).toLocaleString(); }
function timeAgo(epoch) { var seconds = Math.floor(Date.now() / 1000 - epoch); if (seconds < 60) return 'just now'; var minutes = Math.floor(seconds / 60); if (minutes < 60) return minutes + 'm ago'; var hours = Math.floor(minutes / 60); if (hours < 24) return hours + 'h ago'; return Math.floor(hours / 24) + 'd ago'; }

function restorePreferences() {
    var savedTheme = localStorage.getItem('mapTheme');
    if (savedTheme === 'light') { isDarkTheme = true; toggleTheme(); }
    var savedMute = localStorage.getItem('mapMuted');
    if (savedMute === '1') { isMuted = false; toggleMute(); }
}

document.addEventListener('DOMContentLoaded', function() { init(); restorePreferences(); });
