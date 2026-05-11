'use strict';

const path = require('path');

const asBoolean = ({ value, fallback = false }) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return String(value).toLowerCase() === 'true';
};

const asInteger = ({ value, fallback, min }) => {
  const parsed = Number.parseInt(value ?? fallback, 10);

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  if (min !== undefined && parsed < min) {
    return fallback;
  }

  return parsed;
};

const asNumber = ({ value, fallback }) => {
  const parsed = Number(value ?? fallback);

  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveLocalPath = ({ value, fallback }) => {
  return path.resolve(value ?? fallback);
};

const config = {
  port: asInteger({ value: process.env.PORT, fallback: 3000, min: 1 }),
  trustProxy: asBoolean({ value: process.env.TRUST_PROXY, fallback: true }),
  apiKey: process.env.API_KEY ?? '',
  db: {
    driver: (process.env.DB_DRIVER ?? 'sqlite').toLowerCase(),
    path: resolveLocalPath({ value: process.env.DB_PATH, fallback: './data/cctv-scene.db' }),
    databaseUrl: process.env.DATABASE_URL ?? ''
  },
  ollama: {
    url: process.env.OLLAMA_URL ?? 'http://192.168.1.5:11434/api/chat',
    model: process.env.OLLAMA_MODEL ?? 'gemma4:e4b',
    timeoutMs: asInteger({ value: process.env.OLLAMA_TIMEOUT_MS, fallback: 120000, min: 1000 }),
    temperature: asNumber({ value: process.env.OLLAMA_TEMPERATURE, fallback: 0 }),
    numPredict: asInteger({ value: process.env.OLLAMA_NUM_PREDICT, fallback: 768, min: 1 })
  },
  previousFrameMaxAgeSeconds: asInteger({
    value: process.env.PREVIOUS_FRAME_MAX_AGE_SECONDS,
    fallback: 600,
    min: 0
  }),
  images: {
    root: resolveLocalPath({ value: process.env.IMAGE_ROOT, fallback: './images' }),
    storageRoot: resolveLocalPath({ value: process.env.IMAGE_STORAGE_ROOT, fallback: './data/images' }),
    thumbRoot: resolveLocalPath({ value: process.env.THUMB_STORAGE_ROOT, fallback: './data/thumbs' }),
    maxImageBytes: asInteger({ value: process.env.MAX_IMAGE_MB, fallback: 15, min: 1 }) * 1024 * 1024
  },
  retention: {
    originalDays: asInteger({ value: process.env.RETENTION_DAYS_ORIGINAL, fallback: 14, min: 0 }),
    thumbnailDays: asInteger({ value: process.env.RETENTION_DAYS_THUMBNAIL, fallback: 90, min: 0 }),
    metadataDays: asInteger({ value: process.env.RETENTION_DAYS_METADATA, fallback: 365, min: 0 })
  },
  analyseRateLimitPerMinute: asInteger({
    value: process.env.ANALYSE_RATE_LIMIT_PER_MINUTE,
    fallback: 30,
    min: 1
  })
};

module.exports = {
  asBoolean,
  asInteger,
  config
};
