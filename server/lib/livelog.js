// In-memory SSE broadcaster for incoming page events.
// Each connected client is an Express `res` enriched with a `filter` predicate,
// allowing per-client visibility rules (e.g. capcode hiding for non-admins).

const clients = new Set();
let heartbeat = null;

function startHeartbeat() {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    for (const res of clients) {
      try {
        res.write(': keepalive\n\n');
        res.flush && res.flush();
      } catch (_) { /* noop */ }
    }
  }, 25000);
  heartbeat.unref && heartbeat.unref();
}

function stopHeartbeat() {
  if (heartbeat && clients.size === 0) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
}

function add(res, filter) {
  res.__livelogFilter = typeof filter === 'function' ? filter : (row) => row;
  clients.add(res);
  startHeartbeat();
}

function remove(res) {
  clients.delete(res);
  stopHeartbeat();
}

function publish(row) {
  if (clients.size === 0) return;
  for (const res of clients) {
    let payload;
    try {
      payload = res.__livelogFilter(row);
    } catch (_) {
      continue;
    }
    if (!payload) continue;
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      res.flush && res.flush();
    } catch (_) {
      // Write failed, drop the client.
      clients.delete(res);
    }
  }
}

function clientCount() {
  return clients.size;
}

module.exports = { add, remove, publish, clientCount };
