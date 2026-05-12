# Scene Ledger E2E

This directory runs the real Dockerized API against a fixture-driven mock Ollama server.

```bash
./e2e/run.sh
```

The runner removes e2e Docker volumes before and after the suite. The API container also clears `/app/data` and `/app/logs` on every startup, so SQLite state and generated image variants are reset.

Enable request/response logging, including for passing tests, with:

```bash
./e2e/run.sh --verbose
```

`e2e/run.sh` also has a `DEFAULT_VERBOSE` toggle near the top. Use `--quiet` or `--no-verbose` to force verbose output off for a run.

The runner restores the caller's TTY settings after Docker Compose exits. If a terminal was already left in a no-echo state, blindly type `stty sane` and press Enter.

## Layout

- `docker-compose.yml` starts the API, mock Ollama, and test runner.
- `ollama-mock/responses.js` maps known fixture images to deterministic Ollama JSON, malformed content, missing content, and upstream failure responses.
- `tests/endpoints/*.js` keeps request inputs and expected outputs close to each endpoint area.
- `fixtures/images` contains the images used by `/api/analyse/path` and `/api/analyse/upload`.

Error assertions load `../src/errors.json` and reference only error keys in the tests.

The multi-frame sequence fixtures cover movement across frames, objects disappearing and reappearing, empty scenes, OCR confidence changes, search filters, timeline buckets, and reanalysis replacement.
