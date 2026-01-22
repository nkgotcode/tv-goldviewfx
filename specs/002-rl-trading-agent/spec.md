# Feature Specification: RL Trading Agent for Gold

**Feature Branch**: `002-rl-trading-agent`  
**Created**: 2026-01-12  
**Status**: Implemented  
**Input**: User description: "from the current progress of the project I want the trading agent to be a RL AI agent that learns from the chart and market and ideas and signals and news and trades in order to make the most winning trades on gold on bingx. It can be cater for tradingpairs Gold-USDT and XAUTUSDT and PAXGUSDT on bingx perpetual."
**Update**: Training and trading must use full BingX market history across all intervals for GOLD-USDT, XAUTUSDT, and PAXGUSDT perpetual pairs.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run RL trading on gold perpetuals (Priority: P1)

As a trading operator, I can configure the learning-based agent for supported gold perpetual pairs on BingX and start trading so the system can place trades that aim to maximize win rate while respecting risk limits, continuously improving as new information arrives.

**Why this priority**: This is the core business value: automated trading on the specified gold pairs.

**Independent Test**: Can be fully tested by configuring a pair and risk limits, starting live trading, and verifying trades are placed only within allowed constraints.

**Acceptance Scenarios**:

1. **Given** the operator has selected Gold-USDT, XAUTUSDT, or PAXGUSDT and set risk limits, **When** the agent is started in live mode, **Then** trades are placed only for the selected pairs and within the configured limits.
2. **Given** the agent is running, **When** a risk limit is breached, **Then** new trades are blocked and the operator is notified of the pause reason.
3. **Given** new market, idea, signal, or news inputs arrive, **When** the agent processes them, **Then** its decision policy updates within the continuous learning window without interrupting active trading.
4. **Given** the operator uses dashboard controls to switch paper/live mode or pause the agent, **When** the change is confirmed, **Then** the mode/state updates immediately and is logged for audit.

---

### User Story 2 - Evaluate performance before live trading (Priority: P2)

As a trading operator, I can evaluate the agent on historical and paper trading runs to decide whether it is ready for live deployment.

**Why this priority**: Reduces avoidable losses and builds confidence before live trading.

**Independent Test**: Can be fully tested by running an evaluation for a selected pair and reviewing the generated performance report.

**Acceptance Scenarios**:

1. **Given** evaluation data is available for a supported pair, **When** the operator runs an evaluation, **Then** a report is produced with win rate, net PnL after fees, drawdown, trade count, and exposure by pair.

---

### User Story 3 - Manage data sources and quality (Priority: P3)

As a trading operator, I can enable or disable the BingX chart/market feeds along with idea, signal, and news inputs and see when any source is stale or missing so I can maintain reliable trading decisions.

**Why this priority**: Data quality directly impacts trading outcomes and safety.

**Independent Test**: Can be fully tested by disabling a data source and confirming the agent excludes it and flags the change.

**Acceptance Scenarios**:

1. **Given** a data source is disabled by the operator, **When** the agent runs, **Then** decisions exclude that source and the run is marked with the updated input set.
2. **Given** a required BingX market data feed (candles, order book, trades, funding rate, open interest, mark/index price, or ticker) becomes stale beyond the configured freshness threshold, **When** the agent detects staleness, **Then** trading pauses and the operator is alerted.
3. **Given** the operator uses the dashboard to pause, resume, or backfill a data feed (BingX, TradingView, or Telegram), **When** the action completes, **Then** the data source status and trading gate reflect the change within one decision cycle.
4. **Given** the operator reviews ingestion history, **When** they open run history in the dashboard, **Then** they can see per-feed runs with status, counts, and error summaries.

---

### User Story 4 - Data quality and dataset lineage (Priority: P2)

As a trading operator, I can verify data quality scores and dataset lineage so I can trust model training inputs and reproduce evaluations.

**Why this priority**: Poor or unverifiable data will invalidate training results and risk live trading decisions.

**Independent Test**: Trigger a backfill, verify quality metrics per feed, and confirm a dataset version is created with checksums and lineage metadata.

**Acceptance Scenarios**:

1. **Given** an ingestion run completes, **When** I view data quality status, **Then** coverage %, missing fields, and parse confidence are recorded per feed and per pair.
2. **Given** a dataset is prepared for training, **When** I review the run, **Then** the dataset version, feature set version, and source run lineage are attached to the evaluation.
3. **Given** a data quality threshold is violated, **When** the agent evaluates a run, **Then** training and live trading pause until the dataset is remediated.

---

### User Story 5 - Safety governance and monitoring (Priority: P3)

As a trading operator, I can enforce kill switches, promotion gates, and drift alerts so live trading remains safe and auditable.

**Why this priority**: Safety controls prevent large losses and provide a controlled path to live trading.

**Independent Test**: Enable the kill switch, attempt a live trade, and verify the trade is blocked and the event is logged; simulate drift to trigger fallback.

**Acceptance Scenarios**:

1. **Given** the kill switch is enabled, **When** the agent attempts to place a live trade, **Then** the trade is blocked and the action is logged.
2. **Given** promotion gates are not met (min win rate/trade count), **When** the operator requests paper → live, **Then** the request is denied with a clear reason.
3. **Given** drift detection exceeds thresholds, **When** a live session is running, **Then** the system alerts the operator and falls back to the last promoted model.

---

### User Story 6 - Feature inputs from news and OCR (Priority: P4)

As a trading operator, I can include news sentiment and OCR-extracted chart text in the RL feature set so the agent learns from broader context.

**Why this priority**: News and chart annotations often explain price moves not captured by raw market data.

**Independent Test**: Run a feature extraction job with news + OCR enabled and verify the feature set includes those inputs.

**Acceptance Scenarios**:

1. **Given** news ingestion is enabled, **When** a training dataset is generated, **Then** news sentiment features are included with timestamps aligned to market data.
2. **Given** OCR is enabled and chart images are present, **When** the dataset is built, **Then** OCR text embeddings are included with confidence metadata.

---

### Edge Cases

- What happens when market data is delayed or missing for one of the supported pairs?
- How does the system handle conflicting signals from ideas, indicators, and news?
- What happens during exchange maintenance or trading halts?
- How does the system behave during extreme volatility spikes and rapid price gaps?
- What happens when a position is partially filled or rejected?
- What happens if continuous learning degrades performance during a live session?
- What happens when data quality thresholds are violated during training?
- What happens when dataset lineage metadata is missing or inconsistent?
- What happens when drift detection triggers repeatedly?
- What happens when OCR or news feeds are unavailable?

## Release Scope Notes

- Phase 1-3 deliver live/paper run controls, risk limits, and core decision logging for the RL agent.
- Ingestion analytics and operator controls for TradingView, BingX, and Telegram are available in `/ingestion` and `/rl-ops`.
- Data quality, dataset lineage, drift monitoring, and feature input expansion are implemented with ops UI and data model extensions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support a learning-based trading agent that generates trade actions for BingX Gold-USDT, XAUTUSDT, and PAXGUSDT perpetual markets.
- **FR-002**: System MUST allow operators to start, stop, and pause the agent, and to choose between evaluation (paper) and live trading modes.
- **FR-003**: System MUST execute trades only on the supported BingX gold perpetual pairs when live mode is enabled.
- **FR-004**: System MUST enforce configurable risk limits (position size per trade, leverage cap, max daily loss, max drawdown, and max open positions) and block trades that violate them.
- **FR-005**: System MUST ingest and time-align chart data, market data, ideas, signals, news, and trade outcomes for use by the agent.
- **FR-006**: System MUST record each decision and resulting trade outcome with timestamps and win/loss classification for analysis.
- **FR-007**: System MUST generate evaluation reports that include win rate, net PnL after fees, drawdown, trade count, and exposure by pair.
- **FR-008**: System MUST continuously learn from new inputs (ideas, signals, news, charts, and trade outcomes) during active sessions and update its decision policy within a configurable learning window.
- **FR-009**: System MUST allow operators to set the continuous learning window and to pause or resume learning without stopping trading.
- **FR-010**: System MUST pause trading when required inputs are stale beyond configured freshness thresholds or unavailable and resume only after inputs recover.
- **FR-011**: System MUST support deploying a new agent version and rolling back to a previous version if performance degrades.
- **FR-012**: System MUST collect BingX perpetual market data for supported pairs, including OHLCV candles, order book snapshots, recent trades, funding rates, mark/index prices, open interest, and tickers.
- **FR-013**: System MUST support full historical backfill (maximum available from BingX) and continuous refresh of BingX market data for all supported pairs across all supported intervals, with rate-limit handling and gap detection.
- **FR-014**: System MUST normalize and store BingX market data in time-aligned series suitable for RL training and evaluation.
- **FR-015**: System MUST provide operator dashboard controls and analytics for
  ingestion status (BingX market feeds, TradingView, Telegram) and trading
  mode changes (paper/live) with audit logs.
- **FR-016**: System MUST compute data quality metrics (coverage %, missing
  fields, parse confidence) per feed, per pair, and per run, and block training
  or live trading when thresholds are violated.
- **FR-017**: System MUST version datasets with lineage metadata (source runs,
  feature set version, checksums) and attach them to training and evaluation
  runs.
- **FR-018**: System MUST define and document the RL environment (state,
  action, reward) including fees, slippage, liquidation, leverage, and partial
  fill handling.
- **FR-019**: System MUST provide a kill switch that blocks live trades and
  records the reason in audit logs.
- **FR-020**: System MUST enforce promotion gates for paper → live using
  minimum evaluation thresholds (win rate, trade count, drawdown).
- **FR-021**: System MUST enforce per-source gating rules (approved sources
  and minimum confidence thresholds) before executing trades.
- **FR-022**: System MUST detect model drift, notify operators, and fall back
  to the last promoted model when thresholds are exceeded.
- **FR-023**: System MUST integrate news sentiment and OCR-derived chart text
  into the RL feature set when those inputs are enabled.
- **FR-024**: System MUST expose ingestion run history and backfill controls
  for RL data sources in the operator dashboard.

### Non-Functional Requirements

- **NFR-001**: The system MUST produce trade decisions within 3 seconds of new market data availability for supported pairs.
- **NFR-002**: Live trading sessions MUST achieve 99.5% uptime during exchange open hours, excluding planned maintenance windows.
- **NFR-003**: Operator access to start, stop, or configure the agent MUST be restricted to authorized users only.
- **NFR-004**: All trade decisions and executions MUST be auditable for at least 12 months.
- **NFR-005**: Continuous learning updates MUST not interrupt order execution or violate existing risk limits.
- **NFR-006**: All acceptance scenarios and edge cases MUST be covered by automated unit, integration, and end-to-end test suites before live trading is enabled, including data quality, lineage, governance, drift monitoring, and feature input coverage.
- **NFR-007**: BingX market data ingestion MUST respect exchange rate limits and provide deterministic, time-aligned outputs for the RL service.
- **NFR-008**: Dataset versions and lineage metadata MUST be reproducible and
  immutable once used for training or evaluation.
- **NFR-009**: Drift detection and fallback MUST complete within 60 seconds of
  threshold breach during live trading.

### Key Entities *(include if feature involves data)*

- **Market Data**: Time-series prices, volume, and order book snapshots for supported pairs.
- **BingX Market Data Feed**: Candles, trades, order book, funding rates, open interest, mark/index prices, and tickers sourced from BingX perpetual endpoints.
- **Idea**: User or system generated trade thesis linked to a pair and timeframe.
- **Signal**: Structured indicator output that suggests a directional bias or entry/exit condition.
- **News Item**: External event or headline tagged with time, impact score, and related pair.
- **Trade**: Executed order with side, size, price, fees, and realized PnL.
- **Agent Version**: A deployable model instance with training metadata and evaluation results.
- **Risk Limit Set**: Operator-defined constraints governing exposure and loss limits.
- **Evaluation Report**: Summary metrics for a training or paper trading run.
- **Dataset Version**: Immutable snapshot of training inputs with checksums and feature set version.
- **Data Quality Metric**: Coverage and parsing completeness metrics per feed and pair.
- **Drift Alert**: Record of model performance drift and automated fallbacks.
- **Feature Set Version**: Versioned definition of features used for RL training.

### Assumptions

- BingX is the canonical source for chart and perpetual market data for the supported pairs, and full-history coverage is available for required intervals.
- The agent can open both long and short positions on supported perpetual markets.
- Evaluation and paper trading are required before enabling live trading.
- Operators have an approved BingX account with permission to trade perpetuals.
- News and OCR inputs are optional and must not block core trading when disabled.
- Operators will use the dashboard to manage kill switches and promotion gates.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Operators can configure a supported pair and start a paper trading run in under 10 minutes.
- **SC-002**: Over a 30-day paper trading evaluation per pair, the agent achieves a positive net PnL after fees with a win rate of at least 55% while staying within configured risk limits.
- **SC-003**: 95% of trade decisions are produced within 3 seconds of new market data availability during active sessions.
- **SC-004**: When a risk limit is breached, trading pauses within one decision cycle and the operator is notified within 1 minute.
- **SC-005**: During live sessions, continuous learning updates complete within the configured window at least 95% of the time without pausing trading.
- **SC-006**: Market data coverage includes full history (maximum available from the exchange) across all intervals per supported pair with <1% missing intervals after backfill.
- **SC-007**: Dataset versions are generated for 100% of training/evaluation runs with checksums and lineage metadata recorded.
- **SC-008**: Data quality thresholds prevent live trading within 60 seconds of a threshold breach.
- **SC-009**: Drift alerts trigger fallback to the last promoted model within 60 seconds during live sessions.
