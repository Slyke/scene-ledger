FROM node:22-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

FROM node:22-bookworm-slim

WORKDIR /app

RUN groupadd --system sceneledger \
  && useradd --system --gid sceneledger --home-dir /app --shell /usr/sbin/nologin sceneledger \
  && mkdir -p /app/data /app/images /app/logs \
  && chown -R sceneledger:sceneledger /app/data /app/images /app/logs

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY src ./src
COPY scripts ./scripts
COPY error_gen.js ./error_gen.js

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_DRIVER=sqlite
ENV DB_PATH=/app/data/cctv-scene.db
ENV IMAGE_ROOT=/app/images
ENV IMAGE_STORAGE_ROOT=/app/data/images
ENV THUMB_STORAGE_ROOT=/app/data/thumbs
ENV LOG_FILE_PATH=/app/logs/app.jsonl

USER sceneledger

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "scripts/healthcheck.js"]
CMD ["node", "src/server.js"]
