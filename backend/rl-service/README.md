# RL Service (tv-goldviewfx)

Python 3.12+ service that powers inference, evaluation, and training workflows for the RL trading agent.

## Setup

```bash
cd backend/rl-service
uv venv
uv pip install -e ".[test,ml]"
```

## Run Tests

```bash
cd backend/rl-service
uv run pytest
```

## Run Locally

```bash
cd backend/rl-service
uv run uvicorn server:app --host 0.0.0.0 --port 9101
```

## API Endpoints

- `GET /health` — service status
- `POST /inference` — run inference for a market snapshot
- `POST /evaluations` — run evaluation metrics for a window

## Environment Variables

- `RL_ENV` (default `development`)
- `RL_SERVICE_HOST` (default `0.0.0.0`)
- `RL_SERVICE_PORT` (default `9101`)
- `RL_SERVICE_LOG_LEVEL` (default `info`)
- `RL_SERVICE_REQUEST_TIMEOUT_MS` (default `15000`)
- `RL_MODEL_REGISTRY_PATH` (default `./models`)
- `RL_ARTIFACT_BUCKET` (optional Convex file storage tag)
- `CONVEX_URL` (Convex deployment URL for market data access)

## Notes

- Use `uv` for all dependency installs and test runs.
- Keep dependencies on the latest stable releases per project policy.
- RL environment details: `docs/environment.md`.
