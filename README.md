# PagerMon

PagerMon is an API-driven client/server framework for receiving, parsing, storing, and displaying RF pager messages from [multimon-ng](https://github.com/EliasOenal/multimon-ng). It supports POCSAG, FLEX, and EAS message types.

The system includes a **real-time public map** with geocoded call locations, colored incident-type markers, a dynamic filter bar, and Socket.IO live updates.

---

## Features

- **Pager message viewer** with pagination, search, date filtering, sort, and hide-duplicates toggle
- **Real-time live log** via Server-Sent Events (SSE)
- **Public live map** — geocoded call locations with colored markers, dynamic filters, heatmap, live feed mode, notifications, and permalink sharing
- **Capcode aliasing** with colors and icons
- **Incident type management** — auto-discovered from pager traffic, configurable colors/pin letters per type
- **Geocoder plugin** — auto-extracts addresses from pager messages, geocodes via Nominatim, and pushes to the map
- **14 built-in plugins** — Discord, Pushover, Prowl, Telegram, Slack, Gotify, ntfy, SMTP, Webhook (n8n/generic), Regex Filters, Shell, etc.
- **Multi-user** with role-based access (admin/user)
- **Configurable via web UI** — all settings editable without touching config files
- **Duplicate message filtering**
- **WebSockets** (Socket.IO) and **Server-Sent Events** — near real-time updates
- **Docker** — 3-container architecture (PostgreSQL + PagerMon + Public Map)

---

## Quick Start (Docker — Recommended)

```bash
git clone https://github.com/renfrewcountyscanner/pagermonv2.git
cd pagermonv2
cp .env.example .env
# Edit .env — set PG_PASSWORD, MAP_SECRET_KEY, and PUBLIC_MAP_API_KEY
./install.sh
```

The installer handles Docker setup, image builds, database migrations, and seeding. Once complete:

| Service | URL |
|---------|-----|
| PagerMon UI | `http://localhost:3000` |
| Public Map | `http://localhost:5000` |

Default admin login: `admin` / `changeme` (change immediately in Admin → Users).

### First-Time Setup

After running `./install.sh`, configure your instance:

1. **Set your map location** — Edit `.env` and set `MAP_LAT`/`MAP_LNG` to your area, then `docker compose up -d`
2. **Location context** — Go to **Admin → Location Config** and add entries for your pager sources (e.g. "MyCounty Fire" → City/County/State). This biases geocoding for accurate map pins.
3. **Enable Geocoder** — Go to **Admin → Settings → Plugins → Geocoder → Enable**
4. **Scan call types** — Go to **Admin → Call Types → Scan for New Types**. Edit colors and pin letters as desired.
5. **Set up API keys** — Go to **Admin → Settings → Auth → add API keys for your POCSAG reader clients

### Environment Variables (`.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PG_DATABASE` | Yes | `pagermon` | PostgreSQL database name |
| `PG_USER` | Yes | `pagermon` | PostgreSQL user |
| `PG_PASSWORD` | **Yes** | — | PostgreSQL password (set a strong one) |
| `MAP_SECRET_KEY` | **Yes** | — | Flask secret for the map service |
| `PUBLIC_MAP_API_KEY` | **Yes** | — | Shared key between PagerMon and the map service |
| `PUBLIC_MAP_BASE_URL` | No | `http://localhost:5000` | Public URL of the map (used for n8n/Discord map image links) |
| `SERVER_PORT` | No | `3000` | PagerMon web UI port |
| `MAP_PORT` | No | `5000` | Public map port |
| `TZ` | No | `UTC` | Timezone (e.g. `America/Toronto`) |
| `RTL_DEVICE` | No | `0` | RTL-SDR dongle index (client profile) |
| `RTL_FREQ` | No | `148.5875M` | Frequency to monitor (client profile) |
| `POCSAG_MODE` | No | `POCSAG512` | POCSAG decoding mode (client profile) |

### Architecture

```
docker compose up -d
         │
         ├── postgres:16-alpine     ← shared database (mandatory)
         ├── pagermon:3000          ← Express + Vue SPA + API + plugins (mandatory)
         ├── pagermon-map:5000      ← Flask + Leaflet + Socket.IO (mandatory)
         └── pagermon-client         ← RTL-SDR + multimon-ng (--profile client)
```

**Three mandatory containers** (postgres, pagermon, pagermon-map). The client is optional and requires a physical RTL-SDR USB dongle.

**Data persists** in bind-mounted directories under the project root:
```
./postgres-data/   ← PostgreSQL data files
./server-data/     ← PagerMon config
./client-data/     ← Client config (if using client profile)
```

---

## Docker Commands

```bash
# Start all services
docker compose up -d

# Start with RTL-SDR client (requires USB dongle)
docker compose --profile client up -d

# Rebuild and restart
docker compose build --no-cache && docker compose up -d

# View logs
docker compose logs -f pagermon

# Stop everything
docker compose down

# Stop and wipe all data (use with caution)
docker compose down -v
```

---

## Mapping System

### How It Works

1. Pager message arrives via reader.js → PagerMon API
2. **Geocoder plugin** parses the message for an address, resolves the incident type, and geocodes via Nominatim (OpenStreetMap)
3. Geocoded call is stored in PostgreSQL (`pager_calls` table) and pushed to the public map service
4. **Public map** (Flask + Socket.IO) serves a Leaflet map with real-time markers, a dynamic filter bar, and all call details
5. Notifications to n8n/Discord include a map image URL showing the call location (customizable pin color per incident type)

### Configuring Incident Types (pin colors & letters)

1. Log in to PagerMon as admin
2. Go to **Admin → Call Types**
3. Click **Scan for New Types** to auto-discover incident types from your message history
4. Edit each type — set display name, category, **color** (hex picker), and **pin letter** (1-3 chars)
5. New messages will use the configured colors on the map

### Configuring Geocoding Location Context

1. Go to **Admin → Location Config**
2. Add entries mapping your pager sources (e.g. "Ottawa Fire") to geographic context (city, county, state, country)
3. The Geocoder uses this context to bias Nominatim lookups — resulting in more accurate geocoding

### Map Features

- **Dynamic filter bar** — checkboxes per category, driven by the incident types table
- **Colored markers** with category letter codes
- **Auto-zoom** — pans to new calls with a 2-minute auto-fit countdown
- **Live Feed mode** — shows only the most recent call
- **Heatmap** toggle — call density view
- **Dark/light theme** toggle
- **Notifications panel** — tracks recent arrivals with desktop notifications
- **Stats panel** — live counts per category
- **Keyboard shortcuts** — `?` for help, `F` to fit all, `M` to mute, `L` for live feed, `N` for notifications, `T` for test call
- **Permalink sharing** — `?call=123` URLs

---

## Manual Installation (Bare-Metal)

### Prerequisites

- Linux (Debian, Ubuntu, CentOS, Rocky, Alpine)
- [Node.js](https://nodejs.org/) 18.x or higher
- [PostgreSQL](https://www.postgresql.org/) 15+
- Python 3.11+ with `pip` and `venv` (for the public map)
- For client: RTL-SDR dongle + `rtl-sdr` and `multimon-ng` tools

### Server

```bash
git clone https://github.com/renfrewcountyscanner/pagermonv2.git
cd pagermonv2/server
npm install
cp config/default.json config/config.json
# Edit config/config.json — set database.server to your PostgreSQL host, change sessionSecret, set API keys
cd themes/default/vue-client && npm install && npm run build && cd ../..
node app.js
```

### Public Map

```bash
cd pagermonv2/public_map
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env — set PG_HOST, PG_USER, PG_PASSWORD, SECRET_KEY, PUBLIC_MAP_API_KEY
python -c "from app import socketio, app; socketio.run(app, host='0.0.0.0', port=5000)"
```

### Client

```bash
cd pagermonv2/client
npm install
cp config/default.json config/config.json
# Edit config/config.json — set apikey, hostname, and identifier
./reader.sh
```

---

## Plugin Configuration

Plugins are enabled in **Admin → Settings** or by editing `server/config/config.json`. All plugins default to disabled.

### Geocoder Plugin (New in 0.3.14)

The Geocoder parses pager messages for addresses, geocodes them via Nominatim, and pushes to the public map.

| Setting | Description |
|---------|-------------|
| Enable | Toggle the geocoder on/off |
| Rate Limit (ms) | Delay between Nominatim lookups (min 1100ms per ToS) |
| Map Push URL | URL of the public map push endpoint |
| Map API Key | Shared secret for push authentication |
| Enable Deduplication | Skip duplicate address+message within the window |
| Dedup Window (min) | Time window for deduplication (default: 15) |

### Webhook / n8n Integration

1. Enable the **Webhook** plugin in Settings
2. Set **Webhook Mode** to `n8n`
3. Enter your n8n webhook URL and optional Authorization token
4. n8n receives the full message JSON including `map_image_url` (if Geocoder is enabled)

---

## Data Migration (SQLite → PostgreSQL)

If upgrading from an older SQLite-based PagerMon installation:

```bash
cp your-old-messages.db /path/to/pagermonv2/
# Ensure the Docker stack is running, then:
bash scripts/migrate_to_postgres.sh /path/to/messages.db
```

The script exports all messages, capcodes, and users from SQLite and imports them into the running PostgreSQL container. The original database is renamed to `messages.db.bak`.

---

## Upgrading from Docker Hub

Pre-built images are available. Edit `.env`, then:

```bash
docker compose pull
docker compose up -d
```

Image builds are also available via GitHub Actions (`Image-Build.yml` workflow).

---

## Support

Bugs and feature requests: [GitHub Issues](https://github.com/renfrewcountyscanner/pagermonv2/issues)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding conventions, and pull request process.

- Update `CHANGELOG.md` on each PR
- Use KnexJS migration files for database schema changes
- Follow the existing plugin pattern for new plugins

## Versioning

[SemVer](http://semver.org/)

## License

[The Unlicense](LICENSE) — do what you want with it.

## Acknowledgments

- [multimon-ng](https://github.com/EliasOenal/multimon-ng) — pager protocol decoder
- [iCAD Dispatch v2](https://github.com/renfrewcountyscanner/icad_dispatch_v2) — inspiration for the public map system
- [Nominatim](https://nominatim.org/) — OpenStreetMap geocoding
- [Leaflet](https://leafletjs.com/) — map library
- [jSAME](https://github.com/MaxwellDPS/jsame) — EAS alert parsing
