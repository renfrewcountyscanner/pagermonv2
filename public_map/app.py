"""Public Live Map for PagerMon.

Read-only Flask+SocketIO server serving pager call locations from PostgreSQL.
Receives real-time push from PagerMon via /api/push-call and broadcasts to
browsers via SocketIO.
"""
import os
import json
import time
import decimal
import logging
from collections import defaultdict, deque
from datetime import datetime

from flask import Flask, render_template, request, Response
from flask_socketio import SocketIO, emit
from dotenv import load_dotenv

try:
    import psycopg2
except ImportError:
    psycopg2 = None

from map_pin_renderer import MapPinRenderer, MapPinConfig


def sanitize_for_json(obj):
    if isinstance(obj, decimal.Decimal):
        return float(obj)
    elif isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(item) for item in obj]
    return obj


load_dotenv()

PG_HOST = os.environ.get("PG_HOST")
PG_PORT = os.environ.get("PG_PORT", "5432")
PG_DATABASE = os.environ.get("PG_DATABASE")
PG_USER = os.environ.get("PG_USER")
PG_PASSWORD = os.environ.get("PG_PASSWORD")

BASE_URL = os.environ.get("BASE_URL", "http://localhost:5000")
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY is required. Set it in your .env file.")
PUBLIC_MAP_API_KEY = os.environ.get("PUBLIC_MAP_API_KEY")
if not PUBLIC_MAP_API_KEY:
    raise RuntimeError("PUBLIC_MAP_API_KEY is required. Set it in your .env file.")
MAP_LAT = float(os.environ.get("MAP_LAT", "45.42"))
MAP_LNG = float(os.environ.get("MAP_LNG", "-75.70"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("public_map")

app = Flask(__name__, template_folder="templates", static_folder="static")
app.config["SECRET_KEY"] = SECRET_KEY
app.config["JSON_SORT_KEYS"] = False

socketio = SocketIO(
    app,
    async_mode="threading",
    cors_allowed_origins="*",
    ping_interval=25,
    ping_timeout=60,
    logger=False,
    engineio_logger=False,
)

_rate_limit_buckets = defaultdict(list)
_recently_broadcast = deque(maxlen=1000)


def check_rate_limit():
    ip = request.remote_addr or "unknown"
    now = time.time()
    window = 60
    max_requests = 60
    bucket = _rate_limit_buckets[ip]
    bucket[:] = [t for t in bucket if now - t < window]
    if len(bucket) >= max_requests:
        return False
    bucket.append(now)
    return True


def is_duplicate(call_id):
    return call_id in _recently_broadcast


def mark_broadcast(call_id):
    if call_id not in _recently_broadcast:
        _recently_broadcast.append(call_id)


class PagerMonDB:
    def __init__(self, host, port, database, user, password):
        if psycopg2 is None:
            raise RuntimeError("psycopg2 is not installed")
        self.conn_params = {
            "host": host,
            "port": port,
            "dbname": database,
            "user": user,
            "password": password,
        }

    def query(self, sql, params=(), fetch_mode="all"):
        conn = psycopg2.connect(**self.conn_params)
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(sql, params)
        col_names = [desc[0] for desc in cur.description] if cur.description else []
        if fetch_mode == "one":
            row = cur.fetchone()
            result = dict(zip(col_names, row)) if row else None
        else:
            rows = cur.fetchall()
            result = [dict(zip(col_names, row)) for row in rows] if rows else []
        cur.close()
        conn.close()
        return result


def get_db():
    if not all([PG_HOST, PG_DATABASE, PG_USER, PG_PASSWORD]):
        raise RuntimeError(
            "PostgreSQL env vars (PG_HOST, PG_DATABASE, PG_USER, PG_PASSWORD) required."
        )
    return PagerMonDB(PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD)


# ── Routes ─────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("map.html", map_lat=MAP_LAT, map_lng=MAP_LNG)


@app.route("/health")
def health():
    try:
        db = get_db()
        count = db.query("SELECT COUNT(*) as c FROM pager_calls", fetch_mode="one")["c"]
        return {
            "status": "ok",
            "calls_total": count,
            "timestamp": int(time.time()),
        }
    except Exception as e:
        logger.error("Health check failed: %s", e)
        return {"status": "error", "message": str(e)}, 503


# ── Map Image Renderer ─────────────────────────────────────────────

def render_map_png(lat, lng, incident="Other", color=None):
    cfg = MapPinConfig()
    renderer = MapPinRenderer(config=cfg, logger=logger)
    return renderer.render_png(lat=lat, lon=lng, incident_category=incident, color=color)


@app.route("/map-image")
def map_image():
    if not check_rate_limit():
        return {"success": False, "message": "Rate limit exceeded"}, 429

    lat_raw = request.args.get("lat")
    lng_raw = request.args.get("lng")
    incident = request.args.get("incident", "Other").strip()
    color = request.args.get("color", "").strip() or None

    if not lat_raw or not lng_raw:
        return {"success": False, "message": "lat and lng are required"}, 400

    try:
        lat = float(lat_raw)
        lng = float(lng_raw)
    except (TypeError, ValueError):
        return {"success": False, "message": "Invalid lat or lng"}, 400

    if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lng <= 180.0):
        return {"success": False, "message": "lat/lng out of bounds"}, 400

    try:
        png_bytes = render_map_png(lat, lng, incident, color)
    except Exception as e:
        logger.warning("Map render failed: %s", e)
        return {"success": False, "message": "Map render failed"}, 500

    return Response(
        png_bytes,
        mimetype="image/png",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@app.route("/map-image/placeholder")
def map_image_placeholder():
    # 1x1 transparent PNG
    import base64
    pixel = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    )
    return Response(pixel, mimetype="image/png",
        headers={"Cache-Control": "public, max-age=86400"})


# ── API ────────────────────────────────────────────────────────────

def build_call_obj(r):
    lat = r.get("lat")
    lng = r.get("lng")
    is_corrected = False
    if r.get("corrected_lat") is not None and r.get("corrected_lon") is not None:
        lat = float(r["corrected_lat"])
        lng = float(r["corrected_lon"])
        is_corrected = True

    address = (r.get("corrected_address")
               or r.get("formatted_address")
               or r.get("address")
               or "")

    return {
        "call_id": r["call_id"],
        "timestamp": r.get("created_at", 0),
        "datetime": datetime.fromtimestamp(r.get("created_at", 0)).strftime(
            "%Y-%m-%d %H:%M:%S"
        ),
        "incident_type": r.get("incident_type") or "Other",
        "category": r.get("category") or "Other",
        "color": r.get("color") or "#6c757d",
        "pin_letter": r.get("pin_letter") or "O",
        "lat": lat,
        "lng": lng,
        "address": address,
        "alias": r.get("alias") or "",
        "sent_by": r.get("sent_by") or "",
        "cross_streets": r.get("cross_streets") or "",
        "raw_text": r.get("raw_text") or "",
        "message_timestamp": r.get("message_timestamp") or "",
        "has_location": lat is not None and lng is not None,
        "is_corrected": is_corrected,
    }


@app.route("/api/calls")
def api_calls():
    if not check_rate_limit():
        return {"success": False, "message": "Rate limit exceeded"}, 429

    db = get_db()
    since_hours = request.args.get("hours", "24")
    from_epoch = request.args.get("from")
    to_epoch = request.args.get("to")
    after_epoch = request.args.get("after")
    sent_by = request.args.get("sent_by")

    filters = []
    params = []
    meta = {"count": 0}

    if from_epoch:
        try:
            filters.append("created_at >= %s")
            params.append(int(float(from_epoch)))
            meta["from"] = int(float(from_epoch))
        except (TypeError, ValueError):
            filters.append("created_at >= %s")
            params.append(int(time.time() - 24 * 3600))
    elif after_epoch:
        try:
            filters.append("created_at >= %s")
            params.append(int(float(after_epoch)))
            meta["after"] = int(float(after_epoch))
        except (TypeError, ValueError):
            filters.append("created_at >= %s")
            params.append(int(time.time() - 24 * 3600))
    else:
        try:
            hours = float(since_hours)
        except (TypeError, ValueError):
            hours = 24.0
        filters.append("created_at >= %s")
        params.append(int(time.time() - hours * 3600))
        meta["hours"] = hours

    if to_epoch:
        try:
            filters.append("created_at <= %s")
            params.append(int(float(to_epoch)))
            meta["to"] = int(float(to_epoch))
        except (TypeError, ValueError):
            pass

    if sent_by:
        filters.append("sent_by = %s")
        params.append(sent_by)

    category = request.args.get("category")
    if category:
        cats = [c.strip() for c in category.split(",") if c.strip()]
        placeholders = ",".join(["%s"] * len(cats))
        filters.append(f"category IN ({placeholders})")
        params.extend(cats)

    where_clause = " AND ".join(filters)

    now = time.time()
    if from_epoch and to_epoch:
        try:
            range_seconds = float(to_epoch) - float(from_epoch)
        except (TypeError, ValueError):
            range_seconds = 24 * 3600
    elif after_epoch:
        try:
            range_seconds = now - float(after_epoch)
        except (TypeError, ValueError):
            range_seconds = 24 * 3600
    else:
        try:
            range_seconds = float(since_hours) * 3600
        except (TypeError, ValueError):
            range_seconds = 24 * 3600

    if range_seconds <= 86400:
        limit = 500
    elif range_seconds <= 604800:
        limit = 1500
    elif range_seconds <= 2592000:
        limit = 3000
    else:
        limit = 5000
    meta["limit"] = limit

    sql = f"""
        SELECT * FROM pager_calls
        WHERE {where_clause}
        ORDER BY created_at DESC
        LIMIT {limit + 1}
    """
    rows = db.query(sql, tuple(params))
    truncated = len(rows) > limit
    if truncated:
        rows = rows[:limit]
    meta["truncated"] = truncated

    result = [build_call_obj(r) for r in rows]
    meta["count"] = len(result)
    resp = sanitize_for_json({"success": True, "result": result, "meta": meta})
    return Response(
        json.dumps(resp),
        mimetype="application/json",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@app.route("/api/calls/<int:call_id>")
def api_call_detail(call_id):
    if not check_rate_limit():
        return {"success": False, "message": "Rate limit exceeded"}, 429

    db = get_db()
    rows = db.query("SELECT * FROM pager_calls WHERE call_id = %s", (call_id,))
    if not rows:
        return {"success": False, "message": "Call not found"}, 404

    r = rows[0]
    resp = sanitize_for_json({
        "success": True,
        "result": build_call_obj(r),
    })
    return Response(
        json.dumps(resp),
        mimetype="application/json",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@app.route("/api/incident-types/map")
def api_incident_types_map():
    if not check_rate_limit():
        return {"success": False, "message": "Rate limit exceeded"}, 429

    db = get_db()
    rows = db.query(
        "SELECT category, MIN(color) as color, MIN(pin_letter) as pin_letter FROM incident_types WHERE active = 1 GROUP BY category ORDER BY category"
    )
    result = [
        {"category": r["category"], "color": r["color"], "pin_letter": r["pin_letter"]}
        for r in rows
    ]
    resp = sanitize_for_json({"success": True, "categories": result})
    return Response(
        json.dumps(resp),
        mimetype="application/json",
        headers={"Cache-Control": "no-cache"},
    )


@app.route("/api/push-call", methods=["POST"])
def api_push_call():
    api_key = request.headers.get("X-API-Key")
    if not PUBLIC_MAP_API_KEY or api_key != PUBLIC_MAP_API_KEY:
        logger.warning("Unauthorized push attempt from %s", request.remote_addr)
        return {"success": False, "message": "Unauthorized"}, 401

    if not check_rate_limit():
        return {"success": False, "message": "Rate limit exceeded"}, 429

    try:
        data = request.get_json(force=True, silent=True) or {}
        calls = data.get("calls", [])
        if not calls:
            return {"success": False, "message": "No calls in payload"}, 400

        valid_calls = []
        for call in calls:
            if call and call.get("call_id") and call.get("created_at") is not None:
                valid_calls.append(build_call_obj(call))
                mark_broadcast(int(call["call_id"]))

        if valid_calls:
            socketio.emit("new_calls", sanitize_for_json({"calls": valid_calls}))
            logger.info("Broadcast %d pushed call(s)", len(valid_calls))

        return {"success": True, "broadcasted": len(valid_calls)}
    except Exception as e:
        logger.error("Push call error: %s", e)
        return {"success": False, "message": str(e)}, 500


# ── SocketIO Events ────────────────────────────────────────────────

@socketio.on("connect")
def handle_connect():
    emit("connected", {"message": "Live map connected"})


@socketio.on("subscribe")
def handle_subscribe(data):
    resp = {}
    if "hours" in data:
        try:
            resp["hours"] = float(data["hours"])
        except (TypeError, ValueError):
            resp["hours"] = 24.0
    if not resp:
        resp["hours"] = 24.0
    emit("subscribed", resp)


# ── Background Poller ──────────────────────────────────────────────

def poller_loop():
    last_max_id = 0
    POLLER_MIN_AGE = 120

    while True:
        try:
            db = get_db()
            rows = db.query("SELECT MAX(call_id) as max_id FROM pager_calls", fetch_mode="one")
            current_max = rows["max_id"] if rows and rows["max_id"] else 0

            if current_max > last_max_id:
                cutoff = int(time.time()) - POLLER_MIN_AGE
                new_rows = db.query(
                    """
                    SELECT * FROM pager_calls
                    WHERE call_id > %s AND created_at < %s
                    ORDER BY call_id DESC LIMIT 10
                    """,
                    (last_max_id, cutoff),
                )

                calls = [build_call_obj(r) for r in new_rows]
                calls = [c for c in calls if c and not is_duplicate(c["call_id"])]

                if calls:
                    for c in calls:
                        mark_broadcast(c["call_id"])
                    socketio.emit("new_calls", sanitize_for_json({"calls": calls}))
                    logger.info("Poller: broadcast %d new call(s)", len(calls))

                last_max_id = current_max

        except Exception as e:
            logger.error("Poller loop error: %s", e, exc_info=True)

        socketio.sleep(5)


def background_poller():
    while True:
        try:
            logger.info("Starting background poller")
            poller_loop()
        except Exception as e:
            logger.critical("Poller crashed, restarting in 10s: %s", e, exc_info=True)
            time.sleep(10)


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=False)
else:
    @socketio.on("connect")
    def _start_poller():
        if not hasattr(_start_poller, "started"):
            _start_poller.started = True
            socketio.start_background_task(background_poller)
