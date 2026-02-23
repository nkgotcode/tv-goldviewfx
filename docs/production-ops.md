# Production Operations (Convex + Timescale)

## Deploy Convex functions

```bash
npx convex deploy
```

## Manage environment variables

```bash
npx convex env list
npx convex env set NAME value
npx convex env remove NAME
```

## Secret rotation

```bash
./scripts/rotate-secrets.sh
```

- Requires `CONVEX_DEPLOYMENT`, `BINGX_API_KEY`, and `BINGX_SECRET_KEY` in the environment.

## Import/export data

```bash
npx convex import --table <tableName> <path>
npx convex export --path <directoryPath>
```

See the Convex data import/export docs for supported formats and limits.

## Configure Timescale/Postgres backends

Set these environment variables for Timescale-backed backend paths:

- `TIMESCALE_URL` — Postgres/Timescale connection string.
- `TIMESCALE_RL_OPS_ENABLED=true` — RL/ops state repositories use Postgres.
- `TIMESCALE_MARKET_DATA_ENABLED=true` — BingX market-data repositories use Postgres.
- `DISABLE_TEST_DATA_IN_DB=true` — block fixture/test-mode sources (`E2E_RUN`, mock feeds, HTML fixtures) from writing DB state.
- `NODE_ENV=production` — production startup now hard-requires `DISABLE_TEST_DATA_IN_DB=true`.

Notes:

- Backend bootstrap no longer hard-requires `CONVEX_URL` when Timescale paths are enabled.
- `CONVEX_URL` is still required for Convex-backed routes and E2E fixtures.
- In production, startup fails if any fixture/mock flags are present (`E2E_RUN`, `BINGX_MARKET_DATA_MOCK`, `TRADINGVIEW_USE_HTML`, `TRADINGVIEW_HTML_PATH`, `TELEGRAM_MESSAGES_PATH`).

## Daemonize API + worker

```bash
./scripts/daemonize-backend.sh start
./scripts/daemonize-backend.sh status
```

- The script loads `backend/.env` if present.
- Logs: `backend-api.log`, `backend-jobs.log`
- Stop with `./scripts/daemonize-backend.sh stop`

## Production Hardening

- Single source of truth: `prd.md` (checklist + tasks) and `specs/002-rl-trading-agent/tasks.md` (Phases 8 + 12).
- Keep changes synced before any release candidate.
- Execution reconciliation job runs on `TRADE_RECONCILE_INTERVAL_MIN`; trigger on-demand via `POST /ops/trading/reconcile`.
- Account risk summary is available at `GET /ops/trading/risk` (exposure, daily loss, circuit breaker state).
- Decision snapshots log data integrity gate outcomes for provenance auditing.
- Enable strict decision provenance with `RL_ENFORCE_PROVENANCE=true` once artifacts + datasets are fully backfilled.
- RL/ops state can run on Postgres via `TIMESCALE_RL_OPS_ENABLED=true` and `TIMESCALE_URL`.
- Market-data repositories can run on Postgres via `TIMESCALE_MARKET_DATA_ENABLED=true`.
- Observability metrics are stored in `observability_metrics`, with alerts surfaced at `GET /ops/alerts`.
- Retry queue visibility: `GET /ops/retry-queue` for pending retries.
- Online learning multi-ticker runs: configure `RL_ONLINE_LEARNING_PAIRS` (CSV) and `RL_ONLINE_LEARNING_INTERVAL` (primary interval).
- Disaster recovery runbook: `docs/disaster-recovery.md`.
- Release checklist: `docs/release-checklist.md`.
- On-call runbook: `docs/oncall-runbook.md`.

## Production Hardening Updates

The following production blockers have been addressed and are tracked in `specs/002-rl-trading-agent/tasks.md`.

- **Execution replay safety**: replayed executions now resolve missing `exchange_order_id` via client order ID with bounded retries and ops alerts.
- **Single-token RBAC model**: when `API_TOKEN` is set, role headers are ignored and authenticated callers resolve as operator.
- **Candle ordering in integrity gate**: candle timestamps are sorted and out-of-order inputs emit `candles_unsorted` warnings.
- **Search/query scalability**: text search no longer uses `ilike`/`or` in Convex queries; searches require source/time bounds with capped windows to avoid full scans.
- **Exit/cancel flow**: manual close/cancel endpoints are available with reduce-only order support.
- **Allowed instrument enforcement**: `allowed_instruments` is enforced on run start and trade execution paths.
- **Artifact persistence fallback**: model artifacts persist to `convex://storage/...` when Convex storage is configured, otherwise `file://...` fallback is used.

## Data hygiene

- Use the Convex dashboard data view to inspect/remove Convex-backed test records.
- Use SQL (`psql`, Supabase SQL editor, or equivalent) to inspect/remove Timescale-backed RL/ops and market-data records.
- For full table resets, import an empty JSONL file with `--replace`:

```bash
touch empty.jsonl
npx convex import --replace --table ideas empty.jsonl
```
