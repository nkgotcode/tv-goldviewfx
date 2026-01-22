# Data Model: Trading Idea Intelligence Platform

**Feature**: /Users/itsnk/Desktop/Coding/tv-goldviewfx/specs/001-trading-idea-platform/spec.md
**Date**: 2026-01-10

## Entities

### Source

- **Purpose**: Represents a data source (TradingView profile or Telegram
  channel or news feed).
- **Fields**:
  - id (uuid, primary key)
  - type (enum: tradingview, telegram, news)
  - identifier (string, unique within type; e.g., profile handle or channel id)
  - display_name (string)
  - status (enum: active, paused)
  - created_at, updated_at (timestamps)
- **Validation**: identifier required; unique(type, identifier).

### SyncRun

- **Purpose**: Tracks ingestion jobs and their outcomes.
- **Fields**:
  - id (uuid)
  - source_id (fk -> Source)
  - started_at, finished_at (timestamps)
  - status (enum: running, succeeded, failed)
  - new_count, updated_count, error_count (integers)
  - error_summary (string, nullable)
  - coverage_pct (numeric, 0-100)
  - missing_fields_count (integer)
  - parse_confidence (numeric, 0-1)
- **Validation**: status required; counts >= 0.
- **State transitions**: running -> succeeded | failed.

### IngestionConfig

- **Purpose**: Stores operator-managed ingestion schedules, backoff, and enablement
  by source/feed.
- **Fields**:
  - id (uuid)
  - source_type (enum: tradingview, telegram, bingx, news)
  - source_id (fk -> Source, nullable)
  - feed (string, nullable; e.g., candles, trades, news)
  - enabled (boolean)
  - refresh_interval_seconds (integer, nullable)
  - backfill_max_days (integer, nullable)
  - rate_limit_per_minute (integer, nullable)
  - backoff_base_seconds (integer, nullable)
  - backoff_max_seconds (integer, nullable)
  - config (jsonb)
  - created_at, updated_at (timestamps)
- **Validation**: refresh_interval_seconds > 0 when enabled.

### IngestionRun

- **Purpose**: Unified ingestion run tracking across TradingView, Telegram, BingX,
  and news feeds for dashboard analytics.
- **Fields**:
  - id (uuid)
  - source_type (enum: tradingview, telegram, bingx, news)
  - source_id (fk -> Source, nullable)
  - feed (string, nullable)
  - trigger (enum: manual, schedule, backfill)
  - status (enum: running, succeeded, failed)
  - started_at, finished_at (timestamps)
  - new_count, updated_count, error_count (integers)
  - error_summary (string, nullable)
  - coverage_pct (numeric, 0-100)
  - missing_fields_count (integer)
  - parse_confidence (numeric, 0-1)
- **Validation**: status required; counts >= 0.

### OpsAuditEvent

- **Purpose**: Audits operator actions (ingestion control changes, live trading
  mode switches, kill switch actions).
- **Fields**:
  - id (uuid)
  - actor (string, operator identifier)
  - action (string)
  - resource_type (string)
  - resource_id (string, nullable)
  - metadata (jsonb)
  - created_at (timestamp)

### SourcePolicy

- **Purpose**: Controls which sources can drive trading and required confidence.
- **Fields**:
  - id (uuid)
  - source_id (fk -> Source)
  - allow_trading (boolean)
  - min_confidence_score (numeric, 0-1)
  - created_at, updated_at (timestamps)
- **Validation**: min_confidence_score between 0 and 1.

### Idea

- **Purpose**: Stores TradingView ideas with full content.
- **Fields**:
  - id (uuid)
  - source_id (fk -> Source)
  - external_id (string, unique within source)
  - url (string)
  - title (string)
  - author_handle (string)
  - content (text)
  - content_hash (string)
  - duplicate_of_id (fk -> Idea, nullable)
  - dedup_status (enum: canonical, duplicate)
  - review_state (enum: new, triaged, approved, rejected)
  - review_note (text, nullable)
  - reviewed_by (string, nullable)
  - reviewed_at (timestamp, nullable)
  - published_at, ingested_at, updated_at (timestamps)
  - status (enum: active, updated, removed)
- **Validation**: url required; content required; content_hash required.
- **Validation**: if duplicate_of_id is set, dedup_status must be duplicate.
- **State transitions**: active -> updated; active|updated -> removed.

### IdeaRevision

- **Purpose**: Optional history of idea content changes.
- **Fields**:
  - id (uuid)
  - idea_id (fk -> Idea)
  - content (text)
  - content_hash (string)
  - diff_summary (text, nullable)
  - recorded_at (timestamp)
- **Validation**: content_hash required; unique(idea_id, content_hash).

### IdeaNote

- **Purpose**: Operator notes and manual overrides tied to an idea.
- **Fields**:
  - id (uuid)
  - idea_id (fk -> Idea)
  - author (string)
  - note (text)
  - created_at (timestamp)

### IdeaMedia

- **Purpose**: Stores TradingView chart media and OCR results.
- **Fields**:
  - id (uuid)
  - idea_id (fk -> Idea)
  - media_url (string)
  - media_type (enum: image, chart)
  - ocr_text (text, nullable)
  - ocr_confidence (numeric, 0-1, nullable)
  - ocr_status (enum: pending, completed, failed)
  - processed_at (timestamp, nullable)

### TelegramPost

- **Purpose**: Stores Telegram posts used as signals.
- **Fields**:
  - id (uuid)
  - source_id (fk -> Source)
  - external_id (string, message id; unique within source)
  - content (text)
  - content_hash (string)
  - duplicate_of_id (fk -> TelegramPost, nullable)
  - dedup_status (enum: canonical, duplicate)
  - published_at, ingested_at, edited_at (timestamps)
  - status (enum: active, edited, removed)
- **Validation**: content required; unique(source_id, external_id).
- **Validation**: content_hash required.
- **Validation**: if duplicate_of_id is set, dedup_status must be duplicate.
- **State transitions**: active -> edited; active|edited -> removed.

### NewsItem

- **Purpose**: Stores macro and gold-specific news articles.
- **Fields**:
  - id (uuid)
  - source_id (fk -> Source)
  - external_id (string, unique within source)
  - title (string)
  - url (string)
  - content (text, nullable)
  - published_at (timestamp)
  - ingested_at (timestamp)
  - content_hash (string)
  - dedup_status (enum: canonical, duplicate)
  - duplicate_of_id (fk -> NewsItem, nullable)
  - sentiment_label (enum: positive, neutral, negative)
  - sentiment_score (numeric, -1.0 to 1.0)
- **Validation**: url required; content_hash required.

### Enrichment

- **Purpose**: Stores sentiment and similarity data for an idea.
- **Fields**:
  - id (uuid)
  - idea_id (fk -> Idea)
  - sentiment_label (enum: positive, neutral, negative)
  - sentiment_score (numeric, -1.0 to 1.0)
  - similarity_vector (vector)
  - model_name (string)
  - created_at (timestamp)
- **Validation**: sentiment_score between -1 and 1; model_name required.

### EnrichmentRun

- **Purpose**: Tracks enrichment batch runs for audit and diff history.
- **Fields**:
  - id (uuid)
  - trigger (enum: manual, schedule)
  - status (enum: running, succeeded, failed)
  - started_at, finished_at (timestamps)
  - idea_count (integer)
  - error_count (integer)
  - error_summary (string, nullable)

### EnrichmentRevision

- **Purpose**: Records enrichment value changes over time.
- **Fields**:
  - id (uuid)
  - enrichment_id (fk -> Enrichment)
  - diff_summary (text, nullable)
  - recorded_at (timestamp)

### Signal

- **Purpose**: Normalized signal used by the trading agent.
- **Fields**:
  - id (uuid)
  - source_type (enum: tradingview, telegram)
  - source_id (fk -> Source, nullable)
  - idea_id (fk -> Idea, nullable)
  - telegram_post_id (fk -> TelegramPost, nullable)
  - news_item_id (fk -> NewsItem, nullable)
  - enrichment_id (fk -> Enrichment, nullable)
  - generated_at (timestamp)
  - payload_summary (text)
  - confidence_score (numeric, 0 to 1)
- **Validation**: either idea_id, telegram_post_id, or news_item_id required;
  confidence_score between 0 and 1.

### AgentConfiguration

- **Purpose**: Stores trading agent state and risk controls.
- **Fields**:
  - id (uuid)
  - enabled (boolean)
  - mode (enum: paper, live)
  - kill_switch_enabled (boolean)
  - kill_switch_reason (string, nullable)
  - max_position_size (numeric)
  - daily_loss_limit (numeric)
  - max_daily_loss_override (numeric, nullable)
  - promotion_gate_min_win_rate (numeric, nullable)
  - promotion_gate_min_trades (integer, nullable)
  - min_confidence_score (numeric, nullable)
  - allowed_instruments (array of strings)
  - allowed_source_ids (array of uuids, nullable)
  - updated_at (timestamp)
- **Validation**: max_position_size > 0; daily_loss_limit >= 0.

### RoleAssignment

- **Purpose**: Stores RBAC roles for operators and analysts.
- **Fields**:
  - id (uuid)
  - user_id (uuid, Supabase auth user)
  - role (enum: operator, analyst)
  - created_at, updated_at (timestamps)

### Trade

- **Purpose**: Records trade proposals and executions.
- **Fields**:
  - id (uuid)
  - signal_id (fk -> Signal)
  - agent_config_id (fk -> AgentConfiguration)
  - instrument (string, default GOLD-USDT)
  - side (enum: long, short)
  - quantity (numeric)
  - status (enum: proposed, placed, filled, cancelled, rejected)
  - mode (enum: paper, live)
  - client_order_id (string, system-only tag)
  - avg_fill_price (numeric)
  - position_size (numeric)
  - pnl, pnl_pct (numeric)
  - tp_price, sl_price (numeric)
  - liquidation_price, leverage, margin_type
  - created_at, updated_at (timestamps)
- **Validation**: quantity > 0; status required.
- **State transitions**: proposed -> placed -> filled; proposed -> rejected;
  placed -> cancelled.
- **Safety**: client_order_id is used to scope API actions to system-managed orders only.

### TradeExecution

- **Purpose**: Stores execution details for trades.
- **Fields**:
  - id (uuid)
  - trade_id (fk -> Trade)
  - exchange_order_id (string)
  - filled_quantity (numeric)
  - average_price (numeric)
  - executed_at (timestamp)
  - status (enum: partial, filled, failed)
- **Validation**: filled_quantity >= 0; average_price >= 0.

### TopicCluster

- **Purpose**: Stores weekly/monthly topic clusters for idea trends.
- **Fields**:
  - id (uuid)
  - window_start (timestamp)
  - window_end (timestamp)
  - label (string)
  - keywords (array of strings)
  - created_at (timestamp)

### IdeaTopic

- **Purpose**: Maps ideas to topic clusters for trend analysis.
- **Fields**:
  - id (uuid)
  - idea_id (fk -> Idea)
  - topic_id (fk -> TopicCluster)
  - confidence_score (numeric, 0-1)

## Relationships

- Source 1..N Ideas
- Source 1..N TelegramPosts
- Source 1..N SyncRuns
- Source 1..N NewsItems
- Source 1..N SourcePolicies
- Source 0..N IngestionConfigs
- Source 0..N IngestionRuns
- Idea 1..N Enrichments
- Idea 0..N IdeaRevisions
- Idea 0..N IdeaNotes
- Idea 0..N IdeaMedia
- Idea 0..N Signals
- TelegramPost 0..N Signals
- NewsItem 0..N Signals
- Signal 1..N Trades
- Trade 0..N TradeExecutions
- AgentConfiguration 1..N Trades
- TopicCluster 0..N IdeaTopics
- RoleAssignment maps to auth users
- OpsAuditEvent is linked by resource_type/resource_id

## Indexing Notes

- Unique indexes on (source_id, external_id) for Idea and TelegramPost.
- Index on (source_id, content_hash) for deduplication checks.
- Index on Idea.published_at and Idea.ingested_at for dashboard filtering.
- Index on Idea.review_state for workflow filtering.
- Vector index on Enrichment.similarity_vector for similarity search.
- Index on Trade.status and Trade.created_at for dashboard filters.
- Index on IngestionRun.status and IngestionRun.started_at for ops dashboards.
- Index on OpsAuditEvent.created_at for audit timelines.
- Index on NewsItem.published_at for news filters.
- Index on TopicCluster.window_start for trend queries.
