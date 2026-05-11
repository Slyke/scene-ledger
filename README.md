# Scene Ledger

Local CCTV scene logger API for storing analysed frames and frame-specific observations.

## Runtime

- Node.js 22+
- SQLite by default
- PostgreSQL supported with `DB_DRIVER=postgres`
- Ollama chat vision endpoint

## Start

```bash
npm install
npm start
```

The server creates database tables on startup.

## Docker

Development runs the API with `node --watch` and bind-mounts the repo:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Production uses the root `Dockerfile`, runs as a non-root user, and stores SQLite data/logs in named volumes:

```bash
docker compose up --build -d
```

Both compose files expose the API on `http://localhost:3000`, mount `./images` read-only at `/app/images`, and keep generated images/thumbnails under `/app/data`. To reach Ollama on the Docker host, set `OLLAMA_URL=http://host.docker.internal:11434/api/chat`.

## Core Environment

See `.env.example` for all supported settings.

```bash
DB_DRIVER=sqlite
DB_PATH=./data/cctv-scene.db
OLLAMA_URL=http://192.168.1.5:11434/api/chat
OLLAMA_MODEL=gemma4:e4b
IMAGE_ROOT=./images
IMAGE_STORAGE_ROOT=./data/images
THUMB_STORAGE_ROOT=./data/thumbs
```

If `API_KEY` is set, requests under `/api` must include:

```txt
Authorization: Bearer <API_KEY>
```

## Endpoints

- `GET /api/health`
- `GET /api/cameras`
- `POST /api/cameras`
- `POST /api/analyse/path`
- `POST /api/analyse/upload`
- `GET /api/frames/:frame_id`
- `GET /api/frames/:frame_id/image`
- `GET /api/frames/:frame_id/thumbnail`
- `POST /api/frames/:frame_id/reanalyse`
- `GET /api/timeline/days`
- `GET /api/timeline/day`
- `GET /api/timeline/range`
- `GET /api/search`
- `GET /api/search/text`
- `GET /api/observations/names`
- `GET /api/observations/locations`

Observations are per-frame records only. The API does not create persistent scene item IDs.

## Structured Errors

This repo copies the logger and error-code workflow from ../styleguide/logging. Error-producing code paths use stable error keys from src/errors.json.

Manage keys with:

```bash
npm run error-add -- --error-key NEW_ERROR_KEY
npm run error-validate
```
