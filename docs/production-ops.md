# Production Operations (Convex CLI)

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
- Observability metrics are stored in `observability_metrics`, with alerts surfaced at `GET /ops/alerts`.
- Retry queue visibility: `GET /ops/retry-queue` for pending retries.
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

## Data hygiene

- Use the Convex dashboard data view to inspect or remove test records.
- For full table resets, import an empty JSONL file with `--replace`:

```bash
touch empty.jsonl
npx convex import --replace --table ideas empty.jsonl
```
