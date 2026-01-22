# RL Test Data and Local Supabase

This feature requires all unit, integration, and E2E tests to run against a local Supabase Docker stack with deterministic seed data.

## Local Supabase Docker Requirement

- All test suites MUST use the local Supabase Docker stack (no shared or production databases).
- Tests should fail fast if `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` do not point to the local stack.
- Local Supabase Docker provides repeatable data and aligns with least-privilege requirements.
- Use `./scripts/supabase-test.sh` to start/reset/seed the local stack via Supabase CLI.
- Local Supabase ports are configured in `supabase/config.toml` (API 55421, DB 55422, Studio 55423, Inbucket 55424, Analytics 55427, Analytics Syslog 55428).

## Seed Data Sources

- Core seed data: `/Users/itsnk/Desktop/Coding/tv-goldviewfx/supabase/seed/rl_agent_seed.sql`
- Edge case seed data: `/Users/itsnk/Desktop/Coding/tv-goldviewfx/supabase/seed/rl_agent_edge_seed.sql`
- BingX market data fixtures (candles, order book, funding, open interest, mark/index price) are included in RL seed data as it is expanded.

## Test Data Loading

- Backend integration tests load seeds in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/tests/setup.ts` via the Supabase CLI.
- E2E tests reset + seed via `/Users/itsnk/Desktop/Coding/tv-goldviewfx/tests/e2e/fixtures/supabase.ts`.
- RL service tests use synthetic fixtures in `/Users/itsnk/Desktop/Coding/tv-goldviewfx/backend/rl-service/tests/fixtures/`.
  - Include BingX market data fixtures for candles, trades, order book, and funding history.

## Environment Variables

- `SUPABASE_URL` (local API URL)
- `SUPABASE_SERVICE_ROLE_KEY` (local service role key)
- `E2E_API_BASE_URL` (backend API base URL)
- `API_TOKEN` (if auth is required for E2E requests)
- `TRADINGVIEW_USE_HTML` (set true to use `TRADINGVIEW_HTML_PATH` fixtures)
- `TRADINGVIEW_HTML_PATH` (path to `tradingview.html` fixture)
- `FETCH_FULL` (set false for E2E to avoid external idea page fetches)
- `TELEGRAM_MESSAGES_PATH` (path to Telegram fixture JSON for tests)
- `RL_SERVICE_MOCK` (set true to stub RL service calls in backend tests)
- `ALLOW_LIVE_SIMULATION` (set true to simulate live executions without exchange credentials)

## Expected Workflow

1. Start the local Supabase Docker stack.
2. Reset + seed the local database via Supabase CLI (`supabase db reset --local`).
3. Run backend unit + integration tests.
4. Run RL service unit + integration tests using `uv` (`uv run pytest`).
5. Start the backend with fixture envs (`TRADINGVIEW_USE_HTML=true`, `FETCH_FULL=false`, `TELEGRAM_MESSAGES_PATH=...`) for E2E determinism.
6. Run E2E tests.
7. Or run the scripted flow via `./scripts/e2e-local.sh`.

## Guardrails

- Never run tests against production credentials.
- Test data resets must be idempotent to allow repeated runs.
