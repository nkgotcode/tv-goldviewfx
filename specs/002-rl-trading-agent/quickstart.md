# Quickstart: RL Trading Agent for Gold

**Spec**: /Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/002-rl-trading-agent/spec.md

## Prerequisites

- Authorized operator access to the trading system.
- BingX account approved for perpetual trading.
- BingX API access for perpetual market data (public endpoints) and trading (private endpoints). Reference: https://bingx-api.github.io/docs-v3/#/en/info
- Data sources for ideas, signals, and news are available.
- Runtime and library dependencies remain on the latest stable releases for any local services.
- Data quality thresholds and promotion gates are configured before live trading.
- News/OCR feature inputs are optional and can be enabled when data is available.

## Start Here

1. Configure BingX market data ingestion for the supported pairs (candles, order book, trades, funding rate, open interest, mark/index price, ticker).
   - Set `BINGX_MARKET_DATA_INTERVALS` to the full list of supported BingX intervals for all-timeframe coverage.
   - Set `BINGX_MARKET_DATA_INTERVAL_MIN=1` to match the smallest candle interval cadence.
   - Set `BINGX_MARKET_DATA_BACKFILL=true` to keep scheduled backfills running to the earliest available candle.
   - Omit `max_batches` on backfill runs to continue until the earliest available candle.
   - Enable `DATA_GAP_MONITOR_INTERVAL_MIN` to detect and heal missing candle intervals.
2. Create a risk limit set for the selected gold perpetual pair.
3. Configure data sources and freshness thresholds (including each BingX market feed), plus quality thresholds (coverage %, missing fields, parse confidence).
4. Select or generate a dataset version and feature set version for training/evaluation.
5. Set the continuous learning window and enable or disable learning for the run.
6. Run a paper evaluation for the selected pair and review the report.
7. If results meet promotion gates, start a live trading session for the pair.
8. Monitor data source status, quality metrics, and drift alerts during the session.

## Ongoing Operations

- Pause or resume continuous learning without stopping the trading session.
- If learning degrades performance, roll back to the last promoted model version.
- Schedule periodic evaluations to validate performance drift.
- Use the kill switch to immediately block live trading when risk thresholds are breached.

## Validation

- Run unit, integration, and end-to-end test suites before enabling live trading.
- Verify edge case handling for risk limit breaches, stale data sources, partial fills, and extreme volatility.
- Run all tests against the local Supabase Docker stack using seeded data (see `/Users/itsnk/Desktop/Coding/tv-goldviewfx/docs/rl-test-data.md`).
- Confirm BingX market data coverage includes the required candle history before training or evaluation runs.
- Confirm dataset lineage and quality metrics are recorded for the run.

## Exit Criteria

- Trading pauses automatically on risk limit breaches or stale data.
- Operator can stop the session at any time and review the final report.
