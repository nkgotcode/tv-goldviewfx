# RL Environment Specification

This document defines the RL environment assumptions for the gold trading agent.

## State

The state vector includes:

- Recent BingX OHLCV candles and derived statistics (returns, volatility, volume).
- Market microstructure signals (order book depth, trades, funding, open interest, mark/index prices, tickers).
- Auxiliary signals (ideas, telegram signals, news sentiment, OCR text embeddings when enabled).
- Risk context (current exposure, open positions, recent drawdown).

## Action Space

- `long`: open/increase long position
- `short`: open/increase short position
- `close`: close existing position
- `hold`: no action

Position sizing is constrained by the active risk limit set.

## Reward

Reward is based on realized PnL after fees and slippage, with penalties for:

- Breaching risk limits
- Excessive drawdown
- Trading during stale or unavailable data

## Fees & Slippage

- Fee rates are applied per trade based on BingX fee schedules.
- Slippage is modeled using recent spread/volatility inputs and capped by risk limits.

## Liquidation & Margin

- Leverage caps are enforced from risk limits.
- Liquidation price is estimated from entry price, leverage, and margin type.
- Positions are closed immediately on liquidation thresholds.

## Partial Fills

- Partial fills are supported; open positions update with filled quantity.
- Remaining quantity is either canceled or retried based on exchange response.

## Dataset Versioning

- Each dataset version includes a checksum, window bounds, and feature set version.
- Lineage ties dataset versions to ingestion runs for traceability.
