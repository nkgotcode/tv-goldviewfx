# Data Model: RL Trading Agent for Gold

**Spec**: /Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/002-rl-trading-agent/spec.md

## Entities

### AgentVersion

**Purpose**: Tracks a deployable RL model instance and its evaluation outcomes.

**Key fields**:
- id (unique identifier)
- name (human-readable label)
- created_at
- training_window_start, training_window_end
- algorithm_label
- hyperparameter_summary
- artifact_uri
- status (draft, evaluating, promoted, retired)
- promoted_at

**Validation rules**:
- status must be one of: draft, evaluating, promoted, retired
- artifact_uri required when status is evaluating or promoted

**Relationships**:
- one AgentVersion has many EvaluationReports
- one AgentVersion can be active for many AgentRuns

**State transitions**:
- draft -> evaluating -> promoted -> retired
- evaluating -> retired (if evaluation fails)

---

### AgentRun

**Purpose**: Represents a live or paper trading session for a specific pair.

**Key fields**:
- id
- mode (paper, live)
- pair (Gold-USDT, XAUTUSDT, PAXGUSDT)
- status (running, paused, stopped)
- started_at, stopped_at
- learning_enabled (boolean)
- learning_window_minutes
- agent_version_id
- risk_limit_set_id
- dataset_version_id (nullable)
- feature_set_version_id (nullable)

**Validation rules**:
- pair must be one of the supported gold perpetual pairs
- learning_window_minutes must be within configured minimum/maximum bounds

**Relationships**:
- one AgentRun has many TradeDecisions
- one AgentRun references one AgentVersion and one RiskLimitSet
- one AgentRun can reference a DatasetVersion and FeatureSetVersion

**State transitions**:
- running -> paused -> running
- running -> stopped
- paused -> stopped

---

### AgentConfig

**Purpose**: Stores operator-configured RL settings and governance gates.

**Key fields**:
- id
- risk_limit_set_id
- learning_enabled
- learning_window_minutes
- kill_switch_enabled
- kill_switch_reason (nullable)
- promotion_gate_min_win_rate (nullable)
- promotion_gate_min_trades (nullable)
- promotion_gate_max_drawdown (nullable)
- min_confidence_score (nullable)
- allowed_source_ids (array, nullable)
- data_source_config (jsonb)
- updated_at

**Validation rules**:
- learning_window_minutes must be positive if learning_enabled is true
- promotion gate values must be within valid ranges when set

**Relationships**:
- references one RiskLimitSet

---

### RiskLimitSet

**Purpose**: Operator-defined constraints governing exposure and losses.

**Key fields**:
- id
- name
- max_position_size
- leverage_cap
- max_daily_loss
- max_drawdown
- max_open_positions
- effective_from
- active (boolean)

**Validation rules**:
- all numeric limits must be positive
- leverage_cap must be within exchange-allowed range

**Relationships**:
- one RiskLimitSet can be linked to many AgentRuns

---

### DataSourceStatus

**Purpose**: Tracks freshness and availability of required inputs.

**Key fields**:
- id
- source_type (bingx_candles, bingx_orderbook, bingx_trades, bingx_funding, bingx_open_interest, bingx_mark_price, bingx_index_price, bingx_ticker, ideas, signals, news, ocr_text, trades)
- pair
- last_seen_at
- freshness_threshold_seconds
- status (ok, stale, unavailable)
- coverage_pct (nullable)
- missing_fields_count (nullable)
- parse_confidence (nullable)

**Validation rules**:
- freshness_threshold_seconds must be positive
- status must be one of: ok, stale, unavailable

**Relationships**:
- used by AgentRun to gate trading and learning

---

### DataSourceRun

**Purpose**: Records ingestion/backfill runs for RL data sources.

**Key fields**:
- id
- source_type
- pair
- status (running, succeeded, failed)
- started_at, finished_at
- new_count, updated_count, error_count
- error_summary (nullable)

**Validation rules**:
- status must be one of: running, succeeded, failed

---

### DataQualityMetric

**Purpose**: Stores data quality metrics per feed and pair for gating.

**Key fields**:
- id
- source_type
- pair
- coverage_pct
- missing_fields_count
- parse_confidence
- status (ok, degraded, failed)
- computed_at

**Validation rules**:
- coverage_pct between 0 and 100
- parse_confidence between 0 and 1

---

### FeatureSetVersion

**Purpose**: Versions the feature definitions used by RL training.

**Key fields**:
- id
- label
- description (nullable)
- created_at

---

### DatasetVersion

**Purpose**: Immutable snapshot of training/evaluation inputs.

**Key fields**:
- id
- pair
- interval
- start_at, end_at
- checksum
- feature_set_version_id
- created_at

**Validation rules**:
- checksum required
- start_at < end_at

---

### DatasetLineage

**Purpose**: Records lineage between dataset versions and source runs.

**Key fields**:
- id
- dataset_id
- source_run_ids (array)
- parent_dataset_ids (array)
- created_at

---

### DriftAlert

**Purpose**: Records drift detection events and fallback actions.

**Key fields**:
- id
- agent_id
- detected_at
- metric
- baseline_value
- current_value
- status (open, acknowledged, resolved)
- action_taken (nullable)

---

### SourcePolicy

**Purpose**: Gating rules to allow or block trades based on source and confidence.

**Key fields**:
- id
- source_id
- allow_trading
- min_confidence_score
- created_at, updated_at

**Validation rules**:
- min_confidence_score between 0 and 1

---

### BingxCandle

**Purpose**: Stores OHLCV candle data for BingX perpetual pairs.

**Key fields**:
- id
- pair
- interval (BingX interval string, all supported intervals)
- open_time, close_time
- open, high, low, close
- volume, quote_volume
- source (bingx)

**Validation rules**:
- interval must be one of the supported timeframes
- open_time < close_time

**Relationships**:
- used by MarketInputSnapshot.market_features_ref

---

### BingxOrderBookSnapshot

**Purpose**: Captures order book depth snapshots for microstructure features.

**Key fields**:
- id
- pair
- captured_at
- depth_level
- bids (array or reference)
- asks (array or reference)
- source (bingx)

**Validation rules**:
- depth_level must be positive

---

### BingxRecentTrade

**Purpose**: Stores recent trade prints for tape-based features.

**Key fields**:
- id
- pair
- trade_id
- price, quantity
- side (buy, sell)
- executed_at
- source (bingx)

**Validation rules**:
- executed_at must be present

---

### BingxFundingRateSnapshot

**Purpose**: Tracks funding rates and timestamps for perpetual swaps.

**Key fields**:
- id
- pair
- funding_rate
- funding_time
- source (bingx)

**Validation rules**:
- funding_time must be present

---

### BingxOpenInterestSnapshot

**Purpose**: Stores open interest values per pair for leverage/positioning features.

**Key fields**:
- id
- pair
- open_interest
- captured_at
- source (bingx)

---

### BingxMarkIndexPriceSnapshot

**Purpose**: Captures mark/index price references used in perpetual pricing.

**Key fields**:
- id
- pair
- mark_price
- index_price
- captured_at
- source (bingx)

---

### BingxTickerSnapshot

**Purpose**: Stores rolling ticker metrics (last price, 24h volume, 24h change).

**Key fields**:
- id
- pair
- last_price
- volume_24h
- price_change_24h
- captured_at
- source (bingx)

---

### TradeDecision

**Purpose**: Captures agent action decisions and reasoning metadata.

**Key fields**:
- id
- agent_run_id
- pair
- decided_at
- action (long, short, close, hold)
- confidence_score
- inputs_snapshot_ref
- policy_version_label
- risk_check_result (pass, fail)

**Validation rules**:
- action must be one of: long, short, close, hold
- confidence_score must be between 0 and 1

**Relationships**:
- one TradeDecision can have one TradeExecution

---

### TradeExecution

**Purpose**: Stores exchange execution outcomes tied to a decision.

**Key fields**:
- id
- trade_decision_id
- order_id
- status (submitted, partially_filled, filled, rejected, canceled)
- filled_quantity
- average_price
- fees
- realized_pnl
- closed_at

**Validation rules**:
- status must be one of: submitted, partially_filled, filled, rejected, canceled
- filled_quantity must be non-negative

**Relationships**:
- one TradeExecution belongs to one TradeDecision

**State transitions**:
- submitted -> partially_filled -> filled
- submitted -> rejected
- submitted -> canceled

---

### EvaluationReport

**Purpose**: Summarizes evaluation outcomes for an AgentVersion and pair.

**Key fields**:
- id
- agent_version_id
- pair
- period_start, period_end
- win_rate
- net_pnl_after_fees
- max_drawdown
- trade_count
- exposure_by_pair
- status (pass, fail)
- dataset_version_id (nullable)
- feature_set_version_id (nullable)
- created_at

**Validation rules**:
- win_rate must be between 0 and 1
- trade_count must be non-negative

**Relationships**:
- many EvaluationReports per AgentVersion

---

### LearningUpdate

**Purpose**: Tracks continuous learning runs and promotion outcomes.

**Key fields**:
- id
- agent_version_id
- window_start, window_end
- started_at, completed_at
- status (running, succeeded, failed)
- evaluation_report_id

**Validation rules**:
- status must be one of: running, succeeded, failed

**Relationships**:
- one LearningUpdate can reference one EvaluationReport

---

### MarketInputSnapshot

**Purpose**: Immutable snapshot of input features used at decision time.

**Key fields**:
- id
- pair
- captured_at
- market_features_ref
- chart_features_ref
- idea_features_ref
- signal_features_ref
- news_features_ref
- ocr_features_ref

**Validation rules**:
- captured_at must be present for all snapshots

**Relationships**:
- referenced by TradeDecision.inputs_snapshot_ref

## Key Relationships Summary

- AgentRun -> AgentVersion (many-to-one)
- AgentRun -> RiskLimitSet (many-to-one)
- AgentRun -> DatasetVersion (many-to-one)
- AgentRun -> FeatureSetVersion (many-to-one)
- AgentRun -> TradeDecision (one-to-many)
- TradeDecision -> TradeExecution (one-to-one)
- AgentVersion -> EvaluationReport (one-to-many)
- AgentVersion -> LearningUpdate (one-to-many)
- DatasetVersion -> DatasetLineage (one-to-one)
- SourcePolicy -> Source (many-to-one)
