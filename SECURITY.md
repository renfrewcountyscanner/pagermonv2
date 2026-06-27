# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in PagerMon, please report it privately by emailing the maintainers. Do NOT open a public issue.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.3.14+ | ✅ |
| < 0.3.14 | ❌ |

## Security Model

PagerMon is designed for hobbyist and public safety monitoring use. Key security considerations:

- **API keys** are used to authenticate pager message ingestion from reader clients
- **Session-based authentication** protects the web UI and admin panel
- **The public map** is publicly accessible by default (can be restricted via reverse proxy)
- **All secrets** (passwords, keys) are randomly generated on first install by `install.sh`
- **Database passwords** are stored only in the `.env` file (gitignored)
- **Session secrets** are auto-generated and verified at startup

## Best Practices for Deployment

1. Always run `./install.sh` — it generates random secrets
2. Change the default admin password immediately (`admin` / `changeme`)
3. For internet-facing deployments, use a reverse proxy (nginx, Caddy) with HTTPS
4. Restrict the public map with HTTP basic auth or IP whitelist if desired
5. Keep your `.env` file secure — it contains all credentials
6. Update regularly with `git pull && docker compose build --no-cache && docker compose up -d`
