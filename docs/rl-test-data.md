# RL Test Data and Convex Dev Deployments

This feature requires all unit, integration, and E2E tests to run against a Convex dev deployment with predictable data.

## Convex Dev Requirement

- All test suites MUST use a Convex dev deployment (no shared or production databases).
- Tests should fail fast if `CONVEX_URL` is missing.
- Use `npx convex dev` to create or attach a dev deployment and populate `.env.local`.
- Convex schema/indexes (including `bingx_candles`) are applied on `npx convex dev`;
  make sure the schema is loaded before running dataset-heavy tests.

## Seed Data Strategy

- Tests are primarily self-seeding through API calls and fixtures.
- If you need deterministic datasets, export legacy data and import JSONL files using:
  - `scripts/export-legacy-data.ts`
  - `npx convex import --table <tableName> <path>`

## Test Data Loading

- Backend integration tests require `CONVEX_URL` (see `backend/tests/setup.ts`).
- E2E tests validate `CONVEX_URL` via `tests/e2e/fixtures/convex.ts`.
- RL service tests use synthetic fixtures in `backend/rl-service/tests/fixtures/`.

## Phase 12 Model Stack Tests

- Deterministic dataset snapshots are exercised in RL service unit tests (`backend/rl-service/tests/unit/test_dataset_hash.py`).
- Training artifacts are generated in RL service integration tests (`backend/rl-service/tests/integration/test_training_api.py`).
- Evaluation backtests are covered in RL service integration tests (`backend/rl-service/tests/integration/test_evaluation_api.py`) and backend/E2E flows.
- The E2E training pipeline is covered in `tests/e2e/rl-training-flow.spec.ts` against a live RL service instance.

## Environment Variables

- `CONVEX_URL` (Convex deployment URL)
- `E2E_API_BASE_URL` (backend API base URL)
- `API_TOKEN` (if auth is required for E2E requests)
- `TRADINGVIEW_USE_HTML` (set true to use `TRADINGVIEW_HTML_PATH` fixtures)
- `TRADINGVIEW_HTML_PATH` (path to `tradingview.html` fixture)
- `FETCH_FULL` (set false for E2E to avoid external idea page fetches)
- `TELEGRAM_MESSAGES_PATH` (path to Telegram fixture JSON for tests)
- `RL_SERVICE_URL` (RL service base URL; defaults to `http://localhost:9101`)
- `ALLOW_LIVE_SIMULATION` (set true to simulate live executions without exchange credentials)

## Expected Workflow

1. Run `npx convex dev` (or set `CONVEX_URL` explicitly).
2. Optionally import seed data via `npx convex import`.
3. Run backend unit + integration tests.
4. Run RL service unit + integration tests using `uv` (`uv run pytest`).
5. Start the RL service (`uv run uvicorn server:app --host 0.0.0.0 --port 9101`).
6. Start the backend with fixture envs (`TRADINGVIEW_USE_HTML=true`, `FETCH_FULL=false`, `TELEGRAM_MESSAGES_PATH=...`) for E2E determinism.
7. Run E2E tests.
8. Or run the scripted flow via `./scripts/e2e-local.sh`.

## Guardrails

- Never run tests against production credentials.
- Seed data resets must be idempotent to allow repeated runs.
