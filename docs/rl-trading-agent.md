# RL Trading Agent Runbook

This runbook covers operator workflows for the RL trading agent and the supporting ingestion feeds.

## Prerequisites

- Authorized operator access and API credentials.
- Local Supabase Docker running with seeded data for tests.
- RL service running (Python 3.12+ via `uv`).
- BingX API keys configured for live trading.

## Core Dashboards

- `/rl-agent` — start/stop runs, risk limits, learning window controls.
- `/rl-evaluations` — run evaluation reports and review metrics.
- `/rl-data-sources` — enable/disable sources and monitor freshness.
- `/rl-ops` — consolidated ingestion + trading controls and run history.
- `/ingestion` — ingestion analytics and feed controls.

## Standard Workflow

1. **Verify ingestion**: Check `/ingestion` or `/rl-ops` for TradingView, Telegram, and BingX status.
   - TradingView and Telegram only auto-sync when the backend scheduler is running and sources exist.
   - Use `BINGX_MARKET_DATA_INTERVALS` for full-timeframe candle coverage.
   - BingX candles should be polled on the smallest interval cadence (typically 1m).
   - Set `BINGX_MARKET_DATA_BACKFILL=true` to keep scheduled backfills running to the earliest available candle.
   - Backfill runs until the earliest available candle when `max_batches` is omitted.
     If `max_batches` is set, the run stops after that many batches.
   - Enable `DATA_GAP_MONITOR_INTERVAL_MIN` to detect and heal missing candle intervals.
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

## Incident Response

- **Stale data**: Pause the run, trigger backfill, confirm freshness status returns to `ok`.
- **Performance degradation**: Roll back to a prior promoted version.
- **Exchange maintenance**: Pause live mode and resume only when market data stabilizes.

## Local Testing

- Use `supabase start` with configured non-default ports in `supabase/config.toml`.
- Run backend tests with `bun test`.
- Run RL service tests with `cd backend/rl-service && uv run pytest`.
- Use `./scripts/e2e-local.sh` for a fully scripted E2E run.
