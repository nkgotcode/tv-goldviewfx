# RL Feature Architecture: TA-Lib + Online Learning + Nautilus Backtesting

## Goal

Define a production architecture for RL feature engineering and policy lifecycle management that:

1. Uses TA-Lib indicators over existing BingX market data.
2. Keeps training, inference, and backtesting feature generation identical.
3. Supports safe online learning via champion/challenger promotion.
4. Preserves reproducibility with versioned feature snapshots.

## Current Baseline (Repository)

- Raw market data is already persisted from BingX (candles, order book, trades, funding, open interest, mark/index, ticker).
- Dataset generation currently starts from candles and returns OHLCV-centric features.
- RL evaluation triggers Nautilus backtesting from the evaluation flow.
- Online learning cycle exists and can retrain + evaluate + promote.

The main gap is that feature generation is still lightweight and not fully unified across all paths.

## Core Design Decisions

1. Keep raw data immutable; do not store TA directly in `bingx_*` tables.
2. Add a derived feature store keyed by `(pair, interval, open_time, feature_set_version_id)`.
3. Compute TA features in RL service (Python) using TA-Lib.
4. Keep one canonical feature schema and ordering used by:
   - training,
   - live inference,
   - Nautilus backtesting.
5. Promote model versions only through champion/challenger evaluation gates.

## Data Model

### Raw Data (already present)

Use existing market tables as source-of-truth inputs.

### New Derived Table

Create a feature snapshot table (Timescale/Postgres) to cache canonical vectors.

Suggested schema:

- `id` text primary key
- `pair` text not null
- `interval` text not null
- `open_time` timestamptz not null
- `feature_set_version_id` text not null
- `values` jsonb not null
- `source` text not null default `'ta-lib'`
- `is_complete` boolean not null default `true`
- `quality_flags` jsonb not null default `'{}'::jsonb`
- `created_at` timestamptz not null default `now()`
- `updated_at` timestamptz not null default `now()`
- unique key: `(pair, interval, open_time, feature_set_version_id)`

Rationale: fast range reads for training windows, deterministic replay for backtests, and no recomputation on every request.

### Implemented Contract (As-Built)

The active implementation persists feature snapshots in `rl_feature_snapshots` with key:

- `(pair, interval, feature_set_version_id, captured_at)`

and payload:

- `schema_fingerprint` (`text`)
- `features` (`jsonb`)
- `warmup` (`boolean`)
- `is_complete` (`boolean`)
- `source_window_start` / `source_window_end` (`timestamptz`)

## Feature Set Versioning

Feature set versions should encode both structure and parameters:

- indicator family and periods
- warmup requirements
- normalization mode
- optional sources (news, OCR)
- implementation version (TA-Lib + pipeline version)

Store this in `feature_set_versions.description` JSON. Example:

```json
{
  "schema": "v2",
  "ta": {
    "ema": [9, 21, 50],
    "rsi": [14],
    "macd": [12, 26, 9],
    "atr": [14],
    "bbands": [20, 2],
    "obv": true,
    "adx": [14],
    "natr": [14]
  },
  "normalization": "rolling_zscore",
  "includeNews": true,
  "includeOcr": false
}
```

## TA-Lib Indicator Baseline

Use a constrained first release from [TA-Lib functions](https://ta-lib.org/functions/):

- Trend: `EMA`, `MACD`, `ADX`
- Momentum: `RSI`
- Volatility: `ATR`, `NATR`, `BBANDS`
- Volume: `OBV`

Avoid broad candlestick-pattern features in v1; they often increase noise without strong stability gains.

## Canonical Feature Pipeline

1. Load raw candles (+ optional microstructure feeds) for requested range.
2. Sort and validate monotonic timestamps.
3. Compute TA vectors using TA-Lib.
4. Merge optional auxiliary features (news/OCR/signals) based on feature set config.
5. Mark warmup rows as incomplete.
6. Persist to feature snapshot store.
7. Return canonical vectors in strict key order.

All consumers (training, inference, backtest) must call this same pipeline.

## Leakage and Reproducibility Rules

1. Features at time `t` must use values from `<= t` only.
2. No forward-fill from future candles.
3. Warmup rows cannot be used in model fit/evaluation unless explicitly permitted.
4. `dataset_hash` must include:
   - feature set version id,
   - parameters,
   - source window bounds,
   - ordered feature content.

## Online Learning Policy (Champion/Challenger)

1. Train challenger on rolling training window.
2. Evaluate challenger and current champion on the same out-of-sample window.
3. Use fold-based comparison (walk-forward) and require minimum sample size.
4. Promote challenger only if delta gates pass.
5. If gates fail, keep champion and record rejection reason.

Recommended gates:

- minimum trade count
- no regression beyond tolerance in max drawdown
- positive delta in net PnL after fees
- win-rate floor

## Backtesting Policy (Nautilus)

Backtesting remains event-driven in Nautilus, but execution should move to walk-forward bundles:

1. split timeline into multiple folds,
2. add purge/embargo around fold edges,
3. collect per-fold metrics and confidence intervals,
4. store fold results with final evaluation report.

Promotion should depend on fold aggregate and dispersion, not a single-window result.

## Runtime Safety Controls

Keep risk/execution controls independent from policy action:

- kill switch precedence
- data freshness/integrity gates
- OOD feature detection fallback to hold
- circuit-breaker override in account risk state

## Dependency and Environment Notes

RL service dependency updates:

- add `TA-Lib` Python package in `backend/rl-service/pyproject.toml` optional `ml` extras.
- if wheel is unavailable for host architecture, install C library first (`brew install ta-lib`) before `uv pip install TA-Lib`.

Operational defaults:

- keep `RL_STRICT_BACKTEST=true`
- keep online learning disabled by default in production until champion/challenger gates are live.

## Acceptance Criteria

1. Same feature vectors are generated for training, inference, and Nautilus backtests for identical inputs.
2. Feature snapshots are queryable by pair/interval/time/version and match recomputed outputs.
3. Online learning can evaluate challenger vs champion and block non-improving promotions.
4. Evaluation reports include fold-level backtest metadata and promotion rationale.
5. Safety gates can force hold even when model predicts action.
