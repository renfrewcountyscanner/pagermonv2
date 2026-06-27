# PagerMon Server — Multi-stage Docker Build
# Builds the Vue frontend inside the image so you don't need pre-built dist/

# ───────────────────────────────────────────
# Stage 1: Build the Vue frontend
# ───────────────────────────────────────────
FROM node:18-alpine AS vue-builder

WORKDIR /app/vue-client

COPY themes/default/vue-client/package*.json ./
RUN npm ci

COPY themes/default/vue-client/ ./
RUN npm run build

# ───────────────────────────────────────────
# Stage 2: Install server dependencies
# ───────────────────────────────────────────
FROM node:18-alpine AS server-builder

WORKDIR /app

# pg needs build tools for native bindings
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --production

# ───────────────────────────────────────────
# Stage 3: Runtime image
# ───────────────────────────────────────────
FROM node:18-alpine

LABEL org.opencontainers.image.title="PagerMon Server" \
      org.opencontainers.image.description="API-driven pager message server" \
      org.opencontainers.image.source="https://github.com/renfrewcountyscanner/pagermonv2"

RUN apk add --no-cache curl

WORKDIR /app

# Copy built frontend from stage 1
COPY --from=vue-builder /app/vue-client/dist ./themes/default/public/dist

# Copy server dependencies from stage 2
COPY --from=server-builder /app/node_modules ./node_modules

# Copy application source
COPY . ./

# Prepare config directory
RUN mkdir -p /config /defaults && \
    cp /app/config/default.json /defaults/config.json && \
    ln -sf /config/config.json /app/config/config.json && \
    ln -sf /config/backup.json /app/config/backup.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fs http://localhost:3000/health || exit 1

ENV NODE_ENV=production \
    APP_NAME=PagerMon

ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]