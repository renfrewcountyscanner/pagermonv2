# PagerMon Client — Fully Self-Contained
# Includes rtl-sdr, multimon-ng, and the Node.js reader

FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    git \
    cmake \
    build-base \
    libusb-dev \
    linux-headers

# Build rtl-sdr from source
WORKDIR /tmp/rtl-sdr
RUN git clone --depth 1 https://github.com/osmocom/rtl-sdr.git . && \
    mkdir build && cd build && \
    cmake ../ -DINSTALL_UDEV_RULES=ON -DDETACH_KERNEL_DRIVER=ON && \
    make && make install

# Build multimon-ng from source
WORKDIR /tmp/multimon-ng
RUN git clone --depth 1 https://github.com/EliasOenal/multimon-ng.git . && \
    mkdir build && cd build && \
    cmake .. && \
    make && make install

# ───────────────────────────────────────────
# Runtime image
# ───────────────────────────────────────────
FROM node:18-alpine

LABEL org.opencontainers.image.title="PagerMon Client" \
      org.opencontainers.image.description="RTL-SDR pager decoder client" \
      org.opencontainers.image.source="https://github.com/renfrewcountyscanner/pagermonv2"

RUN apk add --no-cache libusb libstdc++

# Copy built binaries from builder
COPY --from=builder /usr/local/bin/rtl_* /usr/local/bin/
COPY --from=builder /usr/local/bin/multimon-ng /usr/local/bin/
COPY --from=builder /usr/local/lib/librtlsdr.so* /usr/local/lib/
RUN ldconfig /usr/local/lib 2>/dev/null || true

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm ci --production

# Copy client source
COPY . ./

# Prepare config directory
RUN mkdir -p /config && \
    ln -sf /config/config.json /app/config/config.json

# Environment defaults
ENV NODE_ENV=production

ENTRYPOINT ["/bin/sh", "-c"]
CMD ["rtl_fm -d ${RTL_DEVICE:-0} -E dc -F 0 -A fast -f ${RTL_FREQ:-148.5875M} -s22050 - | multimon-ng -q -b1 -c -a ${POCSAG_MODE:-POCSAG512} -f alpha -t raw /dev/stdin | node reader.js"]
