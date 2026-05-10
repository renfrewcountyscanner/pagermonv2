# PagerMon

PagerMon is an API driven client/server framework for parsing and displaying pager messages from multimon-ng. It is built around POCSAG messages, but easily supports other message types as required.

The UI is built on a Node/Express/Vue 3/Bootstrap stack, while the client scripts receive piped input from multimon-ng.

## Features

- Capcode aliasing with colors and [FontAwesome](https://fontawesome.io/icons/) icons
- API driven extensible architecture
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

## Screenshots

The UI has been rebuilt with Vue 3 and Bootstrap 5. See the live demo or your local install for current screenshots.

> **Note:** Replace the placeholder links below with screenshots from your own instance.
>
> - Main Messages View: `/`
> - Live Log View: `/livelog`
> - Admin Settings: `/admin`
>
> Live instance: [https://pagermonv2.firepage.ca](https://pagermonv2.firepage.ca)

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18.x or higher (LTS recommended)
- npm (comes with Node.js)
- sqlite3 (if using SQLite; usually pre-installed on most Linux distributions)

#### Recommended

- [nvm](https://github.com/nvm-sh/nvm) for Node version management
- nginx or another reverse proxy for SSL offloading

---

## Running the Server

### Local Setup

1. **Clone the repository**

```bash
git clone https://github.com/renfrewcountyscanner/pagermonv2.git
cd pagermonv2
```

2. **Install server dependencies**

```bash
cd server
npm install
cd ..
```

3. **Build the Vue frontend**

```bash
cd server/themes/default/vue-client
npm install
npm run build
cd ../../../../../
```

4. **Configure the application**

Copy the default configuration and edit it:

```bash
cp server/config/default.json server/config/config.json
```

**Important:** Edit `server/config/config.json` and change at minimum:

- `global.sessionSecret` — set to a long random string (e.g., 32+ alphanumeric characters)
- `auth.keys` — replace the example API key with your own secure keys for client authentication
- `auth.encPass` — this is the bcrypt hash for the default password `changeme`. You can log in with `admin` / `changeme` and change the password via the web UI.

5. **Initialize the database**

On first run, the app will automatically create the SQLite database and run migrations. If you prefer MySQL, update the `database` section in `config.json` before starting.

6. **Start the server**

```bash
cd server
npm start
```

The server will be available at `http://localhost:3000`.

7. **Log in and finish setup**

- Open `http://localhost:3000`
- Log in with username `admin` and password `changeme`
- Go to **Admin > Settings** to change your password, configure API keys, and enable plugins

### Production Deployment with PM2

```bash
npm install pm2 -g
cd server
export NODE_ENV=production
pm2 start process.json
pm2 startup
pm2 save
```

For log rotation:

```bash
pm2 install pm2-logrotate
```

---

## Docker

### Docker Compose (Recommended)

A `docker-compose.yml` is included in the project root.

```yaml
version: '3.3'
services:
  pagermon:
    build: ./server
    image: pagermon
    container_name: pagermon
    ports:
      - 3000:3000
    volumes:
      - ./data:/config
    environment:
      - TZ=Europe/London
      - NODE_ENV=production
      - HOSTNAME=localhost
      - USE_COOKIE_HOST=false
      - APP_NAME=pagermon
```

**Build and run:**

```bash
docker-compose up --build -d
```

**Notes:**

- Configuration and database are stored in `/config` inside the container.
- Mount a host directory or named volume to `/config` to persist data across restarts.
- The Vue frontend must be built **before** creating the Docker image (step 3 in Local Setup).

---

## Running the Client

The PagerMon client receives decoded pager data from [multimon-ng](https://github.com/EliasOenal/multimon-ng) and forwards it to the server.

### Prerequisites

- RTL-SDR tools and dongle (RTL2832U chip)
- multimon-ng
- Node.js and npm (if running the client separately from the server)

### Installation

```bash
cd client
npm install
```

### Configuration

```bash
cp config/default.json config/config.json
```

Edit `config/config.json`:

```json
{
  "apikey": "YOUR_API_KEY_FROM_SERVER",
  "hostname": "http://127.0.0.1:3000",
  "identifier": "MyScanner",
  "sendFunctionCode": false,
  "useTimestamp": true,
  "EAS": {
    "excludeEvents": [],
    "includeFIPS": [],
    "addressAddType": true
  }
}
```

### Running

Edit `reader.sh` to match your RTL-SDR device and frequency, then run:

```bash
rtl_fm -d 0 -E dc -F 0 -A fast -f 148.5875M -s22050 - | \
multimon-ng -q -b1 -c -a POCSAG512 -f alpha -t raw /dev/stdin | \
node reader.js
```

---

## Plugin Configuration

Plugins are enabled in **Admin > Settings** or by editing `server/config/config.json`.

### ntfy Setup

1. Enable the **Ntfy** plugin in Settings.
2. Configure the following fields:
   - **Server URL:** `https://ntfy.sh` (public) or your self-hosted instance (e.g., `https://ntfy.yourdomain.com`)
   - **Topic:** Your ntfy topic name (e.g., `pager-alerts`)
   - **Title:** Notification title (supports `{alias}`, `{message}`, `{address}`, `{agency}`)
   - **Priority:** 1 (min) to 5 (max)
   - **Tags:** Comma-separated tags (e.g., `pager,alert`)
   - **Access Token:** Leave blank for public topics; required for protected topics on self-hosted servers
3. Save settings. Messages matching the plugin filter mode will be pushed to your ntfy topic.

---

## Support

Bugs and feature requests can be logged via the GitHub issues page.

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
