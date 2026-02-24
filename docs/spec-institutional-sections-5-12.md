# Institutional Spec: Storage, Backtesting, RL, Paper/Live, Dashboard (Sections 5–12)

This document captures the implementation spec for sections 5–12 of the institutional-grade rollout, aligned with the existing Nomad jobs (`gvfx-api`, `gvfx-worker`, `gvfx-rl-service`, `gvfx-objectstore`, `gvfx-bingx-full-backfill`, etc.) and the plan in `docs/institutional-grade-architecture-plan.md`.

---

## 5) Storage, Schemas, and Normalization

### 5.1 Two-layer lake

- **Raw Lake (immutable)**  
  Store exactly what the exchange returns (REST JSON, WS frames).  
  Partition: `{venue}/{endpoint}/{YYYY}/{MM}/{DD}/...`  
  Backend writes via `data_lake/raw_lake` to object store (S3-compat; `gvfx-objectstore` MinIO when deployed).

- **Normalized Lake (Nautilus-ready)**  
  Convert raw to Nautilus domain objects; write to Parquet catalog structure compatible with `ParquetDataCatalog`.  
  Implemented in RL service (Python) for Nautilus types; backend can trigger exports or reference catalog paths.

### 5.2 Instrument normalization

- **Canonical ID scheme**: `VENUE:SYMBOL:CONTRACT`  
  Examples: `BINANCE:BTCUSDT:PERP`, `BINGX:BTC-USDT:PERP`, `HYPERLIQUID:BTC:PERP`.

- **Mapping tables**:  
  `venue_symbol` ↔ `canonical_instrument_id`; tick size, step size, contract multiplier, margin currency; maker/taker fees + VIP tier metadata.  
  Stored in DB (Timescale/Postgres) and used by execution, backtest, and RL env.

---

## 6) Backtesting (NautilusTrader)

- **Mode 2 (L1)**: Quotes/trades for better slippage approximation.  
- **Mode 3 (L2/L3)**: Order book sim for highest realism; requires continuous book capture.

- **Cost engine**:  
  Apply maker/taker fees per fill; funding at funding timestamps (position size × mark price × funding rate).  
  Track separately: gross PnL, fees, funding, slippage (estimated vs fill model).

---

## 7) RL Training (SB3 + Nautilus as simulator)

- NautilusTrader as simulator and execution logic; wrap in Gymnasium-compatible env for SB3.  
- **Step**: 1 step = 1 bar (default 1m).  
- **Observation (default)**: Rolling window N=120 bars: log returns (1,5,15), OHLC normalized, volume z-score, EMA(20/100), RSI(14), ATR(14), realized vol(20), funding rate (current + aggregates), mark premium/basis, OI change, portfolio state (position, unrealized PnL, margin usage).  
- **Action (default)**: Discrete 0=Flat, 1=Long, 2=Short; interpreted as target position; trade at next bar open.  
- **Reward (default)**: `ΔEquity - fees - funding - risk_penalty - turnover_penalty`; risk_penalty = λ·|position|·realized_vol (λ=0.1), turnover_penalty = κ·|Δposition| (κ=0.01).  
- **SB3 default**: SAC (continuous actions); buffer_size=1_000_000, batch_size=256, gamma=0.999, tau=0.005, learning_rate=3e-4.

---

## 8) Continuous Learning

- **Walk-forward**: Train T0→T1, Validate T1→T2, Test T2→T3; roll forward.  
- **Metrics**: Net return (after fees+funding), max drawdown, Sharpe/Sortino, turnover, CVaR, stability across windows.  
- **Model registry**: Artifact path, training data hash, feature version, hyperparameters, evaluation report.  
- **Promotion**: Beats champion by +5% net return; max drawdown not worse than +10% relative; sanity checks (turnover, no single-trade dominance, stable across windows).

---

## 9) Paper and Live Trading

- **Paper**: Nautilus sandbox and venue testnets where available.  
- **Live safety defaults**: Max leverage 3x; max position notional 10% equity per instrument; max total exposure 30%; daily loss limit 2% → auto-disable; max drawdown (24h peak) 5% → auto-disable; kill switch (cancel + flatten); prefer post-only limit entries.

---

## 10) Visualization and Telemetry

- Backtest: equity curve, drawdown, exposure, trade distribution, cost attribution (fees/funding/slippage).  
- RL: episodic return, policy entropy, value loss, action distribution, performance by regime.  
- Paper/live: real-time PnL, positions/orders, funding accrual, fee burn, latency (tick-to-decision, decision-to-ack, ack-to-fill).  
- Stack: Prometheus exporters, Grafana dashboards; optional Loki/Alertmanager.

---

## 11) Mission Control Dashboard

- **Tabs**: Overview, Data Lake, Backtests, RL Training, Model Registry, Paper Trading, Live Trading, Risk & Controls, Logs & Alerts, Settings.  
- **Overview**: System health, deployed models, positions & PnL, active jobs (backfill/backtest/train), top alerts.  
- **Data Lake**: Venues/instruments/dates, backfills, coverage heatmap, gap-fill, rate-limit/error drilldowns.  
- **Backtests**: Dataset + strategy config, run/grid, compare runs, export report.  
- **RL**: Env/feature version, train/resume, training curves, evaluation, register to staging.  
- **Paper/Live**: Deploy model, telemetry, risk overrides (admin), kill switch, optional manual orders.

---

## 12) Default Strategies (day-1 baselines)

- **Strategy A – EMA Trend**: 1m; EMA 20/100; stop 1.5×ATR(14), TP 3×ATR(14); size 2% risk per trade.  
- **Strategy B – Bollinger Mean Reversion**: 5m; BB(20,2); entry outside band + RSI (<30 long / >70 short); exit mid-band; leverage cap 2x.  
- **Strategy C – Funding-aware overlay**: Reduce exposure against dominant funding direction (high positive funding → reduce longs; high negative → reduce shorts).
