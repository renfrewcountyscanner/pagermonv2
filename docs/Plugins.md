# Notification Plugins

PagerMon supports multiple notification channels. Plugins are enabled in **Admin → Settings → Plugins**.

## Geocoder

Extracts addresses from pager messages, geocodes them, and pushes to the live map.

| Setting | Description |
|---------|-------------|
| Nominatim Source | Public (free) or Custom (self-hosted) |
| Nominatim URL | API endpoint for geocoding |
| Rate Limit (ms) | Delay between requests (min 1100ms) |
| Bulk Mode | Limits to 4 req/min — use for backfilling |
| Map Push URL | `http://pagermon-public-map:5000/api/push-call` (Docker) |
| Map API Key | Must match `PUBLIC_MAP_API_KEY` in `.env` |
| Enable Deduplication | Skips duplicate address+message within window |
| Dedup Window (min) | Time window for deduplication |

## Webhook (n8n)

Forwards messages to n8n or any HTTP endpoint. The n8n payload includes:
- Message text, address, source, timestamp
- Capcode alias and agency
- `map_image_url` — link to static map PNG of the call location
- `category`, `color`, `pin_letter` — from incident type config

## Other Plugins

| Plugin | Description |
|--------|-------------|
| Discord | Send messages to Discord webhook |
| Pushover | Push notifications via Pushover |
| Telegram | Telegram bot messages |
| Ntfy | ntfy.sh self-hosted push |
| Slack | Slack webhook |
| SMTP | Email forwarding |
| Filter | Regex filter on address/message content |
| RegexReplace | Find-and-replace on message text |
| MessageRepeat | Forward to another PagerMon server |
| SimpleWebhook | Simpler generic webhook |
| Shell | Execute shell script on message receipt |
