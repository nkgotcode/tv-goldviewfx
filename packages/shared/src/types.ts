export type SourceType = "tradingview" | "telegram" | "news";
export type DedupStatus = "canonical" | "duplicate";

export interface Source {
  id: string;
  type: SourceType;
  identifier: string;
  display_name: string | null;
  status: "active" | "paused";
  created_at: string;
  updated_at: string;
}

export interface Idea {
  id: string;
  source_id: string;
  external_id: string | null;
  url: string;
  title: string;
  author_handle: string | null;
  content: string | null;
  content_hash: string;
  duplicate_of_id: string | null;
  dedup_status: DedupStatus;
  published_at: string | null;
  ingested_at: string;
  updated_at: string;
  status: "active" | "updated" | "removed";
  review_status?: "new" | "triaged" | "approved" | "rejected";
  reviewed_at?: string | null;
  reviewed_by?: string | null;
}

export interface IdeaRevision {
  id: string;
  idea_id: string;
  content: string;
  content_hash: string;
  recorded_at: string;
}

export interface TelegramPost {
  id: string;
  source_id: string;
  external_id: string;
  content: string;
  content_hash: string;
  duplicate_of_id: string | null;
  dedup_status: DedupStatus;
  published_at: string | null;
  ingested_at: string;
  edited_at: string | null;
  status: "active" | "edited" | "removed";
}

export interface SyncRun {
  id: string;
  source_id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "succeeded" | "failed";
  new_count: number;
  updated_count: number;
  error_count: number;
  error_summary: string | null;
}

export interface Enrichment {
  id: string;
  idea_id: string;
  sentiment_label: "positive" | "neutral" | "negative";
  sentiment_score: number;
  similarity_vector: number[] | null;
  model_name: string;
  created_at: string;
}

export interface Signal {
  id: string;
  source_type: SourceType;
  idea_id: string | null;
  telegram_post_id: string | null;
  news_item_id?: string | null;
  enrichment_id: string | null;
  generated_at: string;
  payload_summary: string | null;
  confidence_score: number;
}

export interface AgentConfiguration {
  id: string;
  enabled: boolean;
  mode: "paper" | "live";
  max_position_size: number;
  daily_loss_limit: number;
  allowed_instruments: string[];
  kill_switch?: boolean;
  min_confidence_score?: number;
  allowed_source_ids?: string[];
  promotion_required?: boolean;
  promotion_min_trades?: number;
  promotion_min_win_rate?: number;
  promotion_min_net_pnl?: number;
  promotion_max_drawdown?: number;
  updated_at: string;
}

export interface Trade {
  id: string;
  signal_id: string | null;
  agent_config_id: string | null;
  instrument: string;
  side: "long" | "short";
  quantity: number;
  status: "proposed" | "placed" | "filled" | "cancelled" | "rejected";
  mode: "paper" | "live";
  client_order_id: string | null;
  avg_fill_price: number | null;
  position_size: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  tp_price: number | null;
  sl_price: number | null;
  liquidation_price: number | null;
  leverage: number | null;
  margin_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface TradeExecution {
  id: string;
  trade_id: string;
  exchange_order_id: string | null;
  filled_quantity: number;
  average_price: number;
  executed_at: string;
  status: "partial" | "filled" | "failed";
}
