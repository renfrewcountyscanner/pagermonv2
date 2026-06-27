# Contributing to PagerMon

## Development Setup

### Docker (Recommended)

```bash
git clone https://github.com/renfrewcountyscanner/pagermonv2.git
cd pagermonv2
cp .env.example .env  # edit passwords
docker compose up -d
```

The Vue frontend auto-builds inside the Docker image. For rapid Vue development, run Vite dev server locally:

```bash
cd server/themes/default/vue-client
npm install
npm run dev  # hot-reload at http://localhost:5173 with proxy to localhost:3000
```

### Bare-Metal

```bash
# PostgreSQL
apt-get install postgresql postgresql-contrib

# Server
cd server && npm install

# Vue frontend
cd themes/default/vue-client && npm install

# Public map
cd public_map && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
```

## Coding Conventions

### Backend (Node.js / Express)

- Use `var` for consistency with the existing codebase
- Error handling: always pass errors to `logger.main.error()` before responding
- New API routes follow `router.route('/path')` pattern in `routes/api.js`
- Use knex query builder — avoid raw SQL when possible
- Always check auth with `authHelper` middleware

### Frontend (Vue 3)

- Composition API (`<script setup>`) for all new components
- Use `fetch()` for API calls — no axios
- Follow the `AliasesView.vue` / `AliasDetailView.vue` pattern for admin CRUD pages
- Toast notifications via `inject('toast')` from `App.vue`
- Route definitions use lazy imports: `() => import('../views/...)`
- Admin routes need `meta: { requiresAdmin: true }`

### Plugins

New plugins go in `server/plugins/`:
- `<Name>.json` — metadata (name, description, trigger, scope, config fields, aliasConfig)
- `<Name>.js` — implementation (`module.exports = { run: run }`)
- `scope: "before"` runs before DB insert (can modify data and set `data.pluginData.ignore`)
- `scope: "after"` runs after DB insert (gets full message row with alias data)

### Database Migrations

Use KnexJS migrations in `server/knex/migrations/`:
- Filename: `YYYYMMDDHHMMSS_description.js`
- Both `exports.up` and `exports.down` required
- Use knex chain API — avoid raw SQL unless necessary
- Test migrations run via `db.migrate.latest()` on app startup

### Public Map (Python / Flask)

- Use Python 3.11+ syntax
- Rate-limit all public endpoints via `check_rate_limit()`
- Use parameterized queries (`%s` placeholders) — never f-string SQL
- Cache-Control: `no-cache` on all API responses

## Pull Request Process

1. Fork the repo and create a branch from `main`
2. Test your changes with `docker compose up -d`
3. Update `CHANGELOG.md` under the appropriate version heading
4. If adding DB schema changes, include knex migration files
5. Submit a PR with a clear description of the change and why it's needed

## Commit Messages

- Use present tense ("Add feature" not "Added feature")
- Keep first line under 72 characters
- Reference issue numbers when applicable

## Testing

```bash
cd server && npm test
```

Tests use Mocha + Chai. Test database is in `server/test/messages.db` and is reset between test runs.

## Getting Help

Open a [GitHub Discussion](https://github.com/renfrewcountyscanner/pagermonv2/discussions) or [issue](https://github.com/renfrewcountyscanner/pagermonv2/issues).
