# RL Service (tv-goldviewfx)

Python 3.12+ service that powers inference, evaluation, and training workflows for the RL trading agent.

## Setup

```bash
cd backend/rl-service
uv venv
uv pip install -e ".[test,ml]"
```

### TA-Lib Notes

- `TA-Lib` is included in the `ml` extras and is used by the canonical technical feature pipeline.
- If wheel install fails on macOS:
  - `brew install ta-lib`
  - `uv pip install -e ".[ml,test]"`
- If wheel install fails on Linux:
  - install build deps (`build-essential`, `python3-dev`) and TA-Lib headers (`libta-lib0`/`ta-lib` depending on distro), then re-run `uv pip install -e ".[ml,test]"`.
- Runtime fallback:
  - The service falls back to deterministic NumPy implementations for supported indicators (`SMA`, `EMA`, `RSI`, `ATR`, `MACD`, `BBANDS`) when native TA-Lib is unavailable.

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
- `POST /evaluations` — run evaluation metrics for a window (supports walk-forward folds with purge/embargo)

## Environment Variables

- `RL_ENV` (default `development`)
- `RL_SERVICE_HOST` (default `0.0.0.0`)
- `RL_SERVICE_PORT` (default `9101`)
- `RL_SERVICE_LOG_LEVEL` (default `info`)
- `RL_SERVICE_REQUEST_TIMEOUT_MS` (default `15000`)
- `RL_MODEL_REGISTRY_PATH` (default `./models`)
- `RL_ARTIFACT_BUCKET` (optional tag for Convex-backed artifact references)
- `CONVEX_URL` (optional; required only when Convex-backed data/artifact reads are used)
- `RL_STRICT_MODEL_INFERENCE` (default `true`; requires real model artifacts for `/inference`)
- `RL_STRICT_BACKTEST` (default `true`; evaluation fails if Nautilus backtest fails)
- `RL_HEALTH_REQUIRE_ML` (default `true`; `/health` returns 503 if SB3/Nautilus are unavailable)

## Backend integration notes

- Backend RL/ops repositories can run fully on Timescale/Postgres (`TIMESCALE_RL_OPS_ENABLED=true`).
- Backend artifact URIs may be `convex://storage/...` or `file://...` depending on storage configuration.
- RL service should treat `artifact_uri` as opaque and avoid hard-coding Convex-only URI assumptions.

## Notes

- Use `uv` for all dependency installs and test runs.
- Keep dependencies on the latest stable releases per project policy.
- RL environment details: `docs/environment.md`.
