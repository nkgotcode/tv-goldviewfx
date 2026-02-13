# RL Trading Agent Runbook

This runbook covers operator workflows for the RL trading agent and the supporting ingestion feeds.

## Prerequisites

- Authorized operator access and API credentials.
- Convex dev deployment configured (`CONVEX_URL` set).
- RL service running (Python 3.12+ via `uv`).
- BingX API keys configured for live trading.

## Core Dashboards

- `/rl-agent` — start/stop runs, risk limits, learning window controls.
- `/rl-evaluations` — run evaluation reports and review metrics.
- `/rl-data-sources` — enable/disable sources and monitor freshness.
- `/rl-ops` — consolidated ingestion + trading controls and run history.
- `/ingestion` — ingestion analytics and feed controls.
- `/insights` — KLineChart tape views with live and paper trade overlays.

## Standard Workflow

1. **Verify ingestion**: Check `/ingestion` or `/rl-ops` for TradingView, Telegram, and BingX status.
   - TradingView and Telegram only auto-sync when the backend scheduler is running and sources exist.
   - Use `BINGX_MARKET_DATA_INTERVALS` for full-timeframe candle coverage.
   - BingX candles should be polled on the smallest interval cadence (typically 1m).
   - Set `BINGX_MARKET_DATA_BACKFILL=true` to keep scheduled backfills running to the earliest available candle.
   - Backfill runs until the earliest available candle when `max_batches` is omitted.
     If `max_batches` is set, the run stops after that many batches.
   - Enable `DATA_GAP_MONITOR_INTERVAL_MIN` to detect and heal missing candle intervals.
   - Dataset builds read indexed Convex candles first and only fetch live BingX bars
     for missing head/tail windows to keep training/evaluation up to date.
   - Candle range reads use the Convex `by_pair_interval_open_time` index for latest/earliest lookups.
2. **Evaluate**: Run `/rl-evaluations` for the target pair and review win rate, PnL, drawdown, and trade count.
3. **Configure risk limits**: Ensure the correct risk limit set is active.
4. **Start run**: Use `/rl-agent` or `/rl-ops` to start a paper run, then switch to live once gates pass.
5. **Monitor**: Track data source freshness and decision latency logs.
6. **Pause/Resume**: If stale data or risk breaches occur, pause the run and remediate feeds.
7. **Backfill**: Trigger backfills in `/rl-ops` when gaps are detected.

## Safety Gates

- Risk limits block trades on breaches.
- Data source staleness pauses runs automatically.
- Promotion gates require evaluation thresholds before live trading.
- Order executions enforce idempotency keys and state transitions; reconciliation runs on schedule and via `/ops/trading/reconcile`.
- Account-level guardrails enforce exposure caps and circuit breaker cooldowns (see `/ops/trading/risk`).
- Data integrity gates validate candle alignment, gaps, and cross-source drift; provenance is stored with each decision snapshot.

## Production Readiness Updates

These hardening items are now in place ahead of live trading:

- **Idempotency replay safety**: replayed executions attempt client-order recovery with bounded retries and ops alerts for unresolved IDs.
- **Single-operator auth**: when `API_TOKEN` is configured, operator role headers are ignored.
- **Candle ordering**: integrity gating sorts timestamps and emits `candles_unsorted` warnings on out-of-order inputs.
- **Search scalability**: text search no longer uses `ilike`/`or` in Convex queries; searches require source/time bounds with capped windows.
- **Exit controls**: manual endpoints `POST /trades/:id/close` and `POST /trades/:id/cancel` support reduce-only exits and operator overrides.
- **Allowed instrument enforcement**: `allowed_instruments` is enforced during run start and trade execution.

## Incident Response

- **Stale data**: Pause the run, trigger backfill, confirm freshness status returns to `ok`.
- **Performance degradation**: Roll back to a prior promoted version.
- **Exchange maintenance**: Pause live mode and resume only when market data stabilizes.
- **Failed ingestion jobs**: Check `/ops/retry-queue` for pending retries, then re-run backfills.

## Observability

- Metrics are recorded for decision latency, ingestion lag, slippage, and drift in `observability_metrics`.
- Alerts are available via `/ops/alerts` and can be tied back via decision `trace_id` values.

## Model Stack Status

- Dataset snapshots and lineage are recorded with each decision; enable strict enforcement via `RL_ENFORCE_PROVENANCE`.
- Training runs through `/agents/{agentId}/training`, stores SB3 artifacts in Convex storage, and links dataset + feature set IDs.
- Evaluations use Nautilus backtests with configurable `decisionThreshold`; promotion gates are applied from agent config.
- Track remaining improvements in `prd.md` and `specs/002-rl-trading-agent/tasks.md` (Phase 12).

## Local Testing

- Run `npx convex dev` (or set `CONVEX_URL` explicitly).
- Run backend tests with `bun test`.
- Run RL service tests with `cd backend/rl-service && uv run pytest`.
- Use `./scripts/e2e-local.sh` for a fully scripted E2E run.
