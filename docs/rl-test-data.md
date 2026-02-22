# RL Test Data and DB-Backed Test Environments

This feature requires deterministic test data across backend, RL service, and E2E suites.

## Backend DB Requirement

- Backend unit/integration tests can run against:
  - Timescale/Postgres (`TIMESCALE_RL_OPS_ENABLED=true` + `TIMESCALE_URL`), or
  - Convex (`CONVEX_URL`) for legacy paths.
- `backend/tests/setup.ts` sets:
  - `TIMESCALE_TEST_ENABLED`
  - `CONVEX_TEST_ENABLED`
  - `DB_TEST_ENABLED` (true when either backend is reachable)
- Do not run tests against shared/production databases.

## Convex Requirement (E2E)

- Current E2E reset/seed fixtures are Convex-backed.
- E2E runs still require a reachable `CONVEX_URL`.
- Use `npx convex dev` to create/attach a dev deployment and populate `.env.local`.

## Seed Data Strategy

- Tests are primarily self-seeding through API calls and fixtures.
- If you need deterministic datasets, export legacy data and import JSONL files using:
  - `scripts/export-legacy-data.ts`
  - `npx convex import --table <tableName> <path>`

## Test Data Loading

- Backend integration tests require a reachable DB backend (`DB_TEST_ENABLED=true` set by `backend/tests/setup.ts`).
- E2E tests validate `CONVEX_URL` via `tests/e2e/fixtures/convex.ts`.
- RL service tests use synthetic fixtures in `backend/rl-service/tests/fixtures/`.

## Phase 12 Model Stack Tests

- Deterministic dataset snapshots are exercised in RL service unit tests (`backend/rl-service/tests/unit/test_dataset_hash.py`).
- Training artifacts are generated in RL service integration tests (`backend/rl-service/tests/integration/test_training_api.py`).
- Evaluation backtests are covered in RL service integration tests (`backend/rl-service/tests/integration/test_evaluation_api.py`) and backend/E2E flows.
- The E2E training pipeline is covered in `tests/e2e/rl-training-flow.spec.ts` against a live RL service instance.

## Environment Variables

- `TIMESCALE_RL_OPS_ENABLED` (`true` to use Timescale RL/ops repositories in backend tests)
- `TIMESCALE_MARKET_DATA_ENABLED` (`true` to use Timescale market-data repositories)
- `TIMESCALE_URL` (Postgres/Timescale connection URL)
- `CONVEX_URL` (required for Convex-backed E2E fixtures; optional for Timescale-backed backend tests)
- `E2E_API_BASE_URL` (backend API base URL)
- `API_TOKEN` (if auth is required for E2E requests)
- `TRADINGVIEW_USE_HTML` (set true to use `TRADINGVIEW_HTML_PATH` fixtures)
- `TRADINGVIEW_HTML_PATH` (path to `tradingview.html` fixture)
- `FETCH_FULL` (set false for E2E to avoid external idea page fetches)
- `TELEGRAM_MESSAGES_PATH` (path to Telegram fixture JSON for tests)
- `RL_SERVICE_URL` (RL service base URL; defaults to `http://localhost:9101`)
- `ALLOW_LIVE_SIMULATION` (set true to simulate live executions without exchange credentials)

## Expected Workflow

1. For backend integration testing, configure Timescale (`TIMESCALE_URL`, `TIMESCALE_RL_OPS_ENABLED=true`) or Convex.
2. Run backend tests with preload setup: `cd backend && bun test --preload ./tests/setup.ts`.
3. Run RL service unit + integration tests using `uv` (`uv run pytest`).
4. For E2E, run `npx convex dev` (or set `CONVEX_URL` explicitly).
5. Start the backend with fixture envs (`TRADINGVIEW_USE_HTML=true`, `FETCH_FULL=false`, `TELEGRAM_MESSAGES_PATH=...`) for E2E determinism.
6. Run E2E tests.
7. Or run the scripted flow via `./scripts/e2e-local.sh`.

## Guardrails

- Never run tests against production credentials.
- Seed data resets must be idempotent to allow repeated runs.
