# PagerMon

PagerMon is an API-driven client/server framework for parsing and displaying pager messages from [multimon-ng](https://github.com/EliasOenal/multimon-ng). It is built around POCSAG messages, but easily supports FLEX and EAS message types.

The UI is built on a Node/Express/Vue 3/Bootstrap stack, while the client scripts receive piped input from multimon-ng.

**Live demo:** [https://pagermonv2.firepage.ca](https://pagermonv2.firepage.ca)

---

## Features

- Capcode aliasing with colors and [FontAwesome](https://fontawesome.io/icons/) icons
- API-driven extensible architecture
- Multi-user support with role-based access
- SQLite or MySQL database backing
- Configurable via web UI
- Pagination, searching, and filtering by capcode or agency
- Duplicate message filtering
- Native POCSAG / FLEX / EAS Client Support
- Keyword highlighting
- WebSockets & Server-Sent Events — messages delivered in near realtime
- Native browser notifications
- Plugin Support including:
  - [Discord](https://discordapp.com/)
  - [Pushover](https://pushover.net/)
  - [Prowl](https://prowlapp.com)
  - [Telegram](https://telegram.org/)
  - [Slack](https://slack.com/)
  - [Gotify](https://gotify.net/)
  - [ntfy](https://ntfy.sh/) — public or self-hosted push notifications
  - SMTP Email
  - Regex Filters & Replace
  - Message Repeat
  - Simple & Generic Webhooks

---

## Quick Start (One-Line Install)

```bash
curl -fsSL https://raw.githubusercontent.com/renfrewcountyscanner/pagermonv2/main/install.sh | sudo bash
```

This interactive installer will ask whether you want:
- **Server**, **Client**, or **Both**
- **Barebones** (direct install) or **Docker**

Then it will handle everything automatically: dependency installation, Node.js setup, Vue build, config generation, and service creation.

---

## Prerequisites

- Linux (Debian, Ubuntu, CentOS, Rocky, Alpine)
- [Node.js](https://nodejs.org/) 18.x or higher (installed automatically by the script if missing)
- For barebones client: RTL-SDR dongle + `rtl-sdr` and `multimon-ng` tools
- For Docker: Docker Engine + Docker Compose

---

## Manual Installation

### Server

```bash
git clone https://github.com/renfrewcountyscanner/pagermonv2.git
cd pagermonv2/server
npm install
cd themes/default/vue-client
npm install
npm run build
cd ../../../..
cp server/config/default.json server/config/config.json
# Edit server/config/config.json — change sessionSecret and set an API key
node server/app.js
```

The server will be available at `http://localhost:3000`.

Default login:
- **Username:** `admin`
- **Password:** `changeme` (change this immediately in Admin > Settings)

### Client

```bash
cd pagermonv2/client
npm install
cp config/default.json config/config.json
# Edit config/config.json — set apikey, hostname, and identifier
./reader.sh
```

---

## Docker

### Docker Compose (Recommended)

A `docker-compose.yml` is included in the project root. It supports both the server and an optional client container.

```bash
git clone https://github.com/renfrewcountyscanner/pagermonv2.git
cd pagermonv2
cp .env.example .env
# Edit .env to set your timezone, port, and RTL-SDR settings
docker compose up -d --build
```

**To also start the RTL-SDR client:**

```bash
docker compose --profile client up -d --build
```

> The client container requires `--privileged` and `/dev/bus/usb` device mapping for RTL-SDR access.

**Notes:**
- Configuration and database are stored in a Docker named volume (`pagermon-data`).
- The Vue frontend is built **inside** the server Docker image — no need to pre-build `dist/`.
- Healthcheck endpoint: `GET /health`

---

## Plugin Configuration

Plugins are enabled in **Admin > Settings** or by editing `server/config/config.json`.

### Webhook Setup

1. Enable the **Webhook** plugin in Settings.
2. Configure the following fields:
   - **Webhook URL:** Destination URL to POST messages to
   - **Authorization Token:** Optional bearer token for the `Authorization` header
   - **Webhook Mode:** `n8n` (full JSON payload) or `Generic` (custom headers + template)
3. Save settings. Messages will be forwarded automatically.

### ntfy Setup

1. Enable the **Ntfy** plugin in Settings.
2. Configure:
   - **Server URL:** `https://ntfy.sh` (public) or your self-hosted instance
   - **Topic:** Your ntfy topic name
   - **Title:** Notification title
   - **Priority:** 1 (min) to 5 (max)
   - **Tags:** Comma-separated tags
   - **Access Token:** Required for protected topics on self-hosted servers

---

## Support

Bugs and feature requests can be logged via the [GitHub issues page](https://github.com/renfrewcountyscanner/pagermonv2/issues).

## Contributing

All are welcome to contribute. Submit a pull request with your changes.

- Update `CHANGELOG.md` on each pull request.
- If a database schema change is required, use KnexJS migration files.

## Versioning

We use [SemVer](http://semver.org/) for versioning.

## License

This project is licensed under The Unlicense — do what you want with it.

## Acknowledgments

- [multimon-ng](https://github.com/EliasOenal/multimon-ng)
- [jSAME](https://github.com/MaxwellDPS/jsame)
