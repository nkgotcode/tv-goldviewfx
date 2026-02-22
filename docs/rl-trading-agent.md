# RL Trading Agent Runbook

This runbook covers operator workflows for the RL trading agent and the supporting ingestion feeds.

## Prerequisites

- Authorized operator access and API credentials.
- RL service running (Python 3.12+ via `uv`).
- BingX API keys configured for live trading.
- RL/ops database configured via one of:
  - Timescale/Postgres: `TIMESCALE_RL_OPS_ENABLED=true` and `TIMESCALE_URL`.
  - Convex (legacy path): `CONVEX_URL`.

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
   - Dataset builds read persisted candles first (Timescale when `TIMESCALE_MARKET_DATA_ENABLED=true`, Convex otherwise) and only fetch live BingX bars for missing head/tail windows.
   - Candle range reads use indexed pair/interval/open-time access in the active market-data backend.
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
- Feature quality gates enforce forced-hold on missing critical features, OOD candles, and stale feature freshness.
- Order executions enforce idempotency keys and state transitions; reconciliation runs on schedule and via `/ops/trading/reconcile`.
- Account-level guardrails enforce exposure caps and circuit breaker cooldowns (see `/ops/trading/risk`).
- Data integrity gates validate candle alignment, gaps, and cross-source drift; provenance is stored with each decision snapshot.

## Production Readiness Updates

These hardening items are now in place ahead of live trading:

- **Idempotency replay safety**: replayed executions attempt client-order recovery with bounded retries and ops alerts for unresolved IDs.
- **Single-operator auth**: when `API_TOKEN` is configured, operator role headers are ignored.
- **Candle ordering**: integrity gating sorts timestamps and emits `candles_unsorted` warnings on out-of-order inputs.
- **Search scalability**: text search no longer relies on unbounded `ilike`/`or`; searches require source/time bounds with capped windows.
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
- Training runs through `/agents/{agentId}/training`, links dataset + feature set IDs, and stores artifacts to:
  - `convex://storage/...` when `CONVEX_URL` is available.
  - `file://...` fallback when Convex storage is not configured.
- Evaluations use Nautilus backtests with configurable `decisionThreshold`; promotion gates are applied from agent config.
- Evaluations support walk-forward folds (`folds`, `purgeBars`, `embargoBars`, `minTrainBars`, `strict`) and persist fold/aggregate metadata.
- Online learning compares challenger vs champion on the same eval window and persists decision reasons and metric deltas.
- RL/ops state tables (`agent_runs`, `agent_versions`, `evaluation_reports`, `model_artifacts`, `learning_updates`, `agent_configurations`, `risk_limit_sets`, `dataset_versions`, `feature_set_versions`) are served from Postgres when `TIMESCALE_RL_OPS_ENABLED=true`.
- Additional RL/ops operational tables (`trades`, `trade_decisions`, `trade_executions`, `trade_state_events`, `retry_queue`, `data_source_status`, `data_source_configs`, `source_policies`, `ops_audit_events`, `account_risk_state`, `account_risk_policies`, `market_input_snapshots`, `dataset_lineage`) are also Timescale-backed in that mode.
- Track remaining improvements in `prd.md` and `specs/002-rl-trading-agent/tasks.md` (Phase 12).

## TA-Lib and Online Learning Planning Docs

- Architecture: `docs/rl-ta-lib-feature-architecture.md`
- Execution plan: `docs/rl-ta-lib-execution-plan.md`

## TA-Lib Phase Rollout / Rollback

Rollout order:

1. Enable feature snapshots and TA-Lib feature-set `v2` in paper mode.
2. Enable walk-forward evaluation and verify fold metadata in `/rl-evaluations`.
3. Enable online learning with champion/challenger gates.
4. Enable auto roll-forward only after stable paper cycles.

Rollback order:

1. Disable `RL_ONLINE_LEARNING_AUTO_ROLL_FORWARD`.
2. Keep `RL_ONLINE_LEARNING_ENABLED=false` while investigating.
3. Force feature-set selection back to non-TA (`v1`) for runs if needed.

Key env toggles:

- `RL_ONLINE_LEARNING_MIN_WIN_RATE_DELTA`
- `RL_ONLINE_LEARNING_MIN_NET_PNL_DELTA`
- `RL_ONLINE_LEARNING_MAX_DRAWDOWN_DELTA`
- `RL_ONLINE_LEARNING_MIN_TRADE_COUNT_DELTA`
- `RL_FEATURE_OOD_ZSCORE_LIMIT`
- `RL_FEATURE_MAX_MISSING_CRITICAL`
- `RL_FEATURE_MAX_FRESHNESS_SEC`

## Local Testing

- For Timescale-backed backend tests:
  - Set `TIMESCALE_RL_OPS_ENABLED=true`.
  - Set `TIMESCALE_URL` to a reachable Postgres instance.
- For Convex-backed E2E and legacy coverage:
  - Run `npx convex dev` (or set `CONVEX_URL` explicitly).
- Run backend tests with `bun test --preload ./tests/setup.ts`.
- Run RL service tests with `cd backend/rl-service && uv run pytest`.
- Use `./scripts/e2e-local.sh` for a fully scripted E2E run.
