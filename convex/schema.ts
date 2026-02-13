import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema(
  {
    bingx_candles: defineTable({
      pair: v.string(),
      interval: v.string(),
      open_time: v.string(),
      close_time: v.string(),
      open: v.number(),
      high: v.number(),
      low: v.number(),
      close: v.number(),
      volume: v.number(),
      quote_volume: v.optional(v.union(v.number(), v.null())),
      source: v.optional(v.string()),
      id: v.optional(v.string()),
      created_at: v.optional(v.string()),
      updated_at: v.optional(v.string()),
    }).index("by_pair_interval_open_time", ["pair", "interval", "open_time"]),
    bingx_tickers: defineTable({
      pair: v.string(),
      captured_at: v.string(),
      last_price: v.number(),
      volume_24h: v.optional(v.union(v.number(), v.null())),
      price_change_24h: v.optional(v.union(v.number(), v.null())),
      source: v.optional(v.union(v.string(), v.null())),
      created_at: v.optional(v.string()),
      updated_at: v.optional(v.string()),
    }).index("by_pair_captured_at", ["pair", "captured_at"]),
    bingx_mark_index_prices: defineTable({
      pair: v.string(),
      captured_at: v.string(),
      mark_price: v.number(),
      index_price: v.number(),
      source: v.optional(v.union(v.string(), v.null())),
      created_at: v.optional(v.string()),
      updated_at: v.optional(v.string()),
    }).index("by_pair_captured_at", ["pair", "captured_at"]),
    bingx_trades: defineTable({
      pair: v.string(),
      trade_id: v.string(),
      price: v.number(),
      quantity: v.number(),
      side: v.string(),
      executed_at: v.string(),
      source: v.optional(v.union(v.string(), v.null())),
      created_at: v.optional(v.string()),
      updated_at: v.optional(v.string()),
    })
      .index("by_pair_trade_id", ["pair", "trade_id"])
      .index("by_pair_executed_at", ["pair", "executed_at"]),
    bingx_open_interest: defineTable({
      pair: v.string(),
      captured_at: v.string(),
      open_interest: v.number(),
      source: v.optional(v.union(v.string(), v.null())),
      created_at: v.optional(v.string()),
      updated_at: v.optional(v.string()),
    }).index("by_pair_captured_at", ["pair", "captured_at"]),
    bingx_funding_rates: defineTable({
      pair: v.string(),
      funding_time: v.string(),
      funding_rate: v.number(),
      source: v.optional(v.union(v.string(), v.null())),
      created_at: v.optional(v.string()),
      updated_at: v.optional(v.string()),
    }).index("by_pair_funding_time", ["pair", "funding_time"]),
    bingx_orderbook_snapshots: defineTable({
      pair: v.string(),
      captured_at: v.string(),
      depth_level: v.number(),
      bids: v.any(),
      asks: v.any(),
      source: v.optional(v.union(v.string(), v.null())),
      created_at: v.optional(v.string()),
      updated_at: v.optional(v.string()),
    }).index("by_pair_captured_at", ["pair", "captured_at"]),
    ingestion_runs: defineTable({
      id: v.string(),
      source_type: v.string(),
      source_id: v.optional(v.union(v.string(), v.null())),
      feed: v.optional(v.union(v.string(), v.null())),
      trigger: v.string(),
      status: v.string(),
      started_at: v.optional(v.string()),
      finished_at: v.optional(v.union(v.string(), v.null())),
      new_count: v.optional(v.number()),
      updated_count: v.optional(v.number()),
      error_count: v.optional(v.number()),
      error_summary: v.optional(v.union(v.string(), v.null())),
      coverage_pct: v.optional(v.union(v.number(), v.null())),
      missing_fields_count: v.optional(v.union(v.number(), v.null())),
      parse_confidence: v.optional(v.union(v.number(), v.null())),
      created_at: v.optional(v.string()),
      updated_at: v.optional(v.string()),
    })
      .index("by_run_id", ["id"])
      .index("by_started_at", ["started_at"])
      .index("by_source_type_started_at", ["source_type", "started_at"])
      .index("by_source_type_source_id_started_at", ["source_type", "source_id", "started_at"]),
    sync_runs: defineTable({
      id: v.string(),
      source_id: v.string(),
      status: v.string(),
      started_at: v.optional(v.string()),
      finished_at: v.optional(v.union(v.string(), v.null())),
      new_count: v.optional(v.number()),
      updated_count: v.optional(v.number()),
      error_count: v.optional(v.number()),
      error_summary: v.optional(v.union(v.string(), v.null())),
      coverage_pct: v.optional(v.union(v.number(), v.null())),
      missing_fields_count: v.optional(v.union(v.number(), v.null())),
      parse_confidence: v.optional(v.union(v.number(), v.null())),
      created_at: v.optional(v.string()),
      updated_at: v.optional(v.string()),
    })
      .index("by_run_id", ["id"])
      .index("by_started_at", ["started_at"])
      .index("by_source_id_started_at", ["source_id", "started_at"]),
  },
  {
    schemaValidation: false,
    strictTableNameTypes: false,
  },
);
