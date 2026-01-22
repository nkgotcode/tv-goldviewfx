# RL Service Test Fixtures

This directory holds synthetic inputs for RL service unit and integration tests.

## Contents

- Market data snapshots (candles, spreads, last price)
- Auxiliary inputs (ideas, signals, news)
- Trade history samples for learning windows

## Guidelines

- Keep fixtures small and deterministic.
- Use ISO-8601 timestamps in UTC.
- Include edge cases like missing fields, gaps, and extreme volatility.
