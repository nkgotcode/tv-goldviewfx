import { z } from "zod";

export const sourceSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["tradingview", "telegram"]),
  identifier: z.string().min(1),
  display_name: z.string().nullable(),
  status: z.enum(["active", "paused"]),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ideaSchema = z.object({
  id: z.string().uuid(),
  source_id: z.string().uuid(),
  external_id: z.string().nullable(),
  url: z.string().url(),
  title: z.string().min(1),
  author_handle: z.string().nullable(),
  content: z.string().nullable(),
  content_hash: z.string().min(1),
  duplicate_of_id: z.string().uuid().nullable(),
  dedup_status: z.enum(["canonical", "duplicate"]),
  published_at: z.string().nullable(),
  ingested_at: z.string(),
  updated_at: z.string(),
  status: z.enum(["active", "updated", "removed"]),
});

export const telegramPostSchema = z.object({
  id: z.string().uuid(),
  source_id: z.string().uuid(),
  external_id: z.string(),
  content: z.string(),
  content_hash: z.string().min(1),
  duplicate_of_id: z.string().uuid().nullable(),
  dedup_status: z.enum(["canonical", "duplicate"]),
  published_at: z.string().nullable(),
  ingested_at: z.string(),
  edited_at: z.string().nullable(),
  status: z.enum(["active", "edited", "removed"]),
});

export const syncRunSchema = z.object({
  id: z.string().uuid(),
  source_id: z.string().uuid(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  status: z.enum(["running", "succeeded", "failed"]),
  new_count: z.number().int().nonnegative(),
  updated_count: z.number().int().nonnegative(),
  error_count: z.number().int().nonnegative(),
  error_summary: z.string().nullable(),
});

export const enrichmentSchema = z.object({
  id: z.string().uuid(),
  idea_id: z.string().uuid(),
  sentiment_label: z.enum(["positive", "neutral", "negative"]),
  sentiment_score: z.number(),
  similarity_vector: z.array(z.number()).nullable(),
  model_name: z.string(),
  created_at: z.string(),
});

export const signalSchema = z.object({
  id: z.string().uuid(),
  source_type: z.enum(["tradingview", "telegram"]),
  idea_id: z.string().uuid().nullable(),
  telegram_post_id: z.string().uuid().nullable(),
  enrichment_id: z.string().uuid().nullable(),
  generated_at: z.string(),
  payload_summary: z.string().nullable(),
  confidence_score: z.number(),
});

export const agentConfigSchema = z.object({
  id: z.string().uuid(),
  enabled: z.boolean(),
  mode: z.enum(["paper", "live"]),
  max_position_size: z.number(),
  daily_loss_limit: z.number(),
  allowed_instruments: z.array(z.string()),
  updated_at: z.string(),
});

export const tradeSchema = z.object({
  id: z.string().uuid(),
  signal_id: z.string().uuid().nullable(),
  agent_config_id: z.string().uuid().nullable(),
  instrument: z.string(),
  side: z.enum(["long", "short"]),
  quantity: z.number(),
  status: z.enum(["proposed", "placed", "filled", "cancelled", "rejected"]),
  mode: z.enum(["paper", "live"]),
  client_order_id: z.string().nullable(),
  avg_fill_price: z.number().nullable(),
  position_size: z.number().nullable(),
  pnl: z.number().nullable(),
  pnl_pct: z.number().nullable(),
  tp_price: z.number().nullable(),
  sl_price: z.number().nullable(),
  liquidation_price: z.number().nullable(),
  leverage: z.number().nullable(),
  margin_type: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const tradeExecutionSchema = z.object({
  id: z.string().uuid(),
  trade_id: z.string().uuid(),
  exchange_order_id: z.string().nullable(),
  filled_quantity: z.number(),
  average_price: z.number(),
  executed_at: z.string(),
  status: z.enum(["partial", "filled", "failed"]),
});
