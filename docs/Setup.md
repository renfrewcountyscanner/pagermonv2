# PagerMon Setup Guide

## Quick Start (Docker)

```bash
git clone https://github.com/renfrewcountyscanner/pagermonv2.git
cd pagermonv2
./install.sh
```

`install.sh` auto-generates `.env` with random secrets and sensible defaults, installs missing Docker prerequisites when required, builds Docker images, starts all services, and runs database migrations. It may recreate PagerMon containers but does not delete the bind-mounted data directories.

**No editing required** for local testing. The map will center at 0,0 until you set your area coordinates.

## Production Setup

All values in `.env.example` are placeholders. Keep the generated `.env` private: it is ignored by Git along with runtime config and persistent data directories.

Edit `.env` with values for your area:

| Variable | What to set |
|----------|------------|
| `TZ` | Your timezone (e.g. `America/Toronto`, `Europe/London`) |
| `MAP_LAT` | Latitude of your dispatch center |
| `MAP_LNG` | Longitude of your dispatch center |
| `PUBLIC_MAP_BASE_URL` | Public URL for the map service (for n8n/Discord image links) |

Then restart:
```bash
docker compose down && docker compose up -d
```

## Default Login

- **Username:** `admin`
- **Password:** `changeme`
- **Change immediately:** Admin → Users → Edit admin

## First-Time Setup (5 Steps)

### 1. Configure Location Context
**Admin → Location Config → New Location**

Add entries for each of your dispatch sources. This biases geocoding for accurate map pins.

Example:
```
Source: Ottawa Fire → City: Ottawa, County: Ottawa-Carleton, State: ON, Country: CA
```

Set the **Bounding Box** to prevent wrong-city geocodes:
```
Min Lat: 45.15, Max Lat: 45.55
Min Lng: -76.10, Max Lng: -75.45
```

### 2. Enable the Geocoder
**Admin → Settings → Plugins → Geocoder → Enable**

**Nominatim Source:** Choose "Public" (free) or "Custom" (self-hosted instance).

### 3. Scan Call Types
**Admin → Call Types → Scan for New Types**

This discovers all incident types from your message history. Edit colors and pin letters for each type.

### 4. Set Up API Keys
**Admin → Settings → Auth → API Keys**

Create API keys for your POCSAG reader clients. Each client uses an `apikey` header to post messages.

### 5. Connect Your Reader (Optional)
If using an RTL-SDR dongle:

```bash
docker compose --profile client up -d
```

For existing reader setups: configure the client to POST to `http://your-server:3000/api/messages` with your API key header.

## Architecture

```
docker compose up -d
         │
         ├── postgres:16-alpine     ← shared database
         ├── pagermon-server:3000   ← Express + Vue SPA + API
         ├── public-map:5000        ← Flask + Leaflet + Socket.IO
         └── pagermon-client         ← RTL-SDR + multimon-ng (--profile client)
```

## Services

| Service | URL | Purpose |
|---------|-----|---------|
| PagerMon | `http://localhost:3000` | Web UI for messages, admin, settings |
| Live Map | `http://localhost:5000` | Public map with real-time markers |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PG_DATABASE` | No | `pagermon` | PostgreSQL database name |
| `PG_USER` | No | `pagermon` | PostgreSQL user |
| `PG_PASSWORD` | No | auto-generated | PostgreSQL password |
| `MAP_SECRET_KEY` | No | auto-generated | Flask secret |
| `PUBLIC_MAP_API_KEY` | No | auto-generated | Map push auth key |
| `PUBLIC_MAP_BASE_URL` | Yes | — | Map service public URL |
| `TZ` | Yes | — | Timezone |
| `MAP_LAT` | Yes | — | Map center latitude |
| `MAP_LNG` | Yes | — | Map center longitude |
| `SERVER_PORT` | No | `3000` | PagerMon UI port |
| `MAP_PORT` | No | `5000` | Map port |
| `RTL_FREQ` | No | `148.5875M` | Pager frequency |
| `POCSAG_MODE` | No | `POCSAG512` | Decoding mode |

## Docker Commands

```bash
# Start all services
docker compose up -d

# Start with RTL-SDR client
docker compose --profile client up -d

# Rebuild and restart
docker compose build --no-cache && docker compose up -d

# View PagerMon server logs
docker compose logs -f pagermon-server

# Stop everything
docker compose down

# Stop and wipe all data
docker compose down -v
```

## Data Persistence

Data survives container restarts in these directories:
```
./postgres-data/   ← PostgreSQL files
./server-data/     ← Config and backups
./client-data/     ← Client configuration
```

## Map Features

- **Dynamic filter bar** — checkboxes per incident type category
- **Colored markers** — configured per call type in admin
- **Auto-zoom** — pans to new calls
- **Live Feed mode** — shows only the most recent call
- **Heatmap** — call density view
- **Dark/light theme** toggle
- **Notifications** — desktop notifications for new calls
- **Keyboard shortcuts** — `?` for help, `F` for fit, `M` for mute
- **Permalinks** — `?call=123` shareable URLs

## Upgrading from Older SQLite Install

If you have an existing SQLite `messages.db`:

```bash
# Copy your messages.db anywhere accessible
# Ensure the Docker stack is running, then:
bash scripts/migrate_to_postgres.sh /path/to/messages.db
```

This exports all messages, capcodes, and users from SQLite and imports them into the running PostgreSQL container. The original database is renamed to `messages.db.bak`.
