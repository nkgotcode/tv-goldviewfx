import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const RESET_TOKEN = "local-e2e";

const TABLES_TO_RESET = [
  "ideas",
  "enrichments",
  "signals",
  "telegram_posts",
  "news_items",
  "ocr_items",
  "trades",
  "trade_decisions",
  "trade_executions",
  "trade_state_events",
  "agent_runs",
  "agent_versions",
  "agent_configurations",
  "dataset_versions",
  "feature_set_versions",
  "model_artifacts",
  "risk_limit_sets",
  "data_source_status",
  "data_source_configs",
  "sources",
  "ops_alerts",
  "ops_audit_events",
  "retry_queue",
  "ingestion_runs",
  "sync_runs",
] as const;

type TableName = (typeof TABLES_TO_RESET)[number];

async function deleteAll(db: any, table: TableName) {
  try {
    const docs = await db.query(table).collect();
    for (const doc of docs) {
      await db.delete(doc._id);
    }
    return { table, deleted: docs.length };
  } catch (error) {
    return { table, deleted: 0, error: String(error) };
  }
}

async function insertIfMissing(db: any, table: TableName, row: Record<string, unknown>) {
  if (!row.id) {
    throw new Error(`Seed row for ${table} is missing id.`);
  }
  const existing = await db
    .query(table)
    .filter((q: any) => q.eq(q.field("id"), row.id))
    .first();
  if (!existing) {
    await db.insert(table, row);
  }
}

export const ping = query({
  args: {},
  handler: async () => ({ ok: true, timestamp: new Date().toISOString() }),
});

export const reset = mutation({
  args: { token: v.string() },
  handler: async ({ db }, args) => {
    if (args.token !== RESET_TOKEN) {
      throw new Error("Invalid reset token.");
    }
    const results = [];
    for (const table of TABLES_TO_RESET) {
      results.push(await deleteAll(db, table));
    }
    return { ok: true, results };
  },
});

export const seed = mutation({
  args: { token: v.string() },
  handler: async ({ db }, args) => {
    if (args.token !== RESET_TOKEN) {
      throw new Error("Invalid seed token.");
    }

    const now = new Date().toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const riskLimitId = "11111111-1111-4111-8111-111111111111";
    const agentVersionId = "22222222-2222-4222-8222-222222222222";
    const retiredAgentVersionId = "22222222-2222-4222-8222-222222222223";
    const featureSetId = "33333333-3333-4333-8333-333333333333";
    const datasetVersionId = "44444444-4444-4444-8444-444444444444";
    const artifactId = "55555555-5555-4555-8555-555555555555";
    const sourceTradingViewId = "66666666-6666-4666-8666-666666666666";
    const sourceTelegramId = "77777777-7777-4777-8777-777777777777";
    const ideaId = "88888888-8888-4888-8888-888888888888";
    const enrichmentId = "99999999-9999-4999-8999-999999999999";
    const signalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const tradeId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const tradeExecutionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const opsAlertId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const retryQueueId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

    await insertIfMissing(db, "sources", {
      id: sourceTradingViewId,
      type: "tradingview",
      identifier: "seeded-tradingview",
      display_name: "Seeded TradingView",
      created_at: now,
      updated_at: now,
    });
    await insertIfMissing(db, "sources", {
      id: sourceTelegramId,
      type: "telegram",
      identifier: "seeded-telegram",
      display_name: "Seeded Telegram",
      created_at: now,
      updated_at: now,
    });

    await insertIfMissing(db, "ideas", {
      id: ideaId,
      source_id: sourceTradingViewId,
      external_id: "seed-idea-ext-1",
      url: "https://tradingview.com/seed/idea-1",
      title: "Seeded Idea: Gold breakout",
      author_handle: "seeded",
      content: "Seeded idea content for deterministic e2e runs.",
      content_hash: "seeded-idea-hash-1",
      published_at: now,
      dedup_status: "canonical",
      created_at: now,
      updated_at: now,
    });

    await insertIfMissing(db, "enrichments", {
      id: enrichmentId,
      idea_id: ideaId,
      sentiment_label: "neutral",
      sentiment_score: 0,
      similarity_vector: [],
      model_name: "seeded-enrichment",
      created_at: now,
      updated_at: now,
    });

    await insertIfMissing(db, "signals", {
      id: signalId,
      source_type: "tradingview",
      idea_id: ideaId,
      telegram_post_id: null,
      news_item_id: null,
      enrichment_id: enrichmentId,
      payload_summary: "Seeded signal payload summary.",
      confidence_score: 0.72,
      generated_at: now,
      created_at: now,
      updated_at: now,
    });

    await insertIfMissing(db, "risk_limit_sets", {
      id: riskLimitId,
      name: "Baseline Risk Limits",
      max_position_size: 1.5,
      leverage_cap: 3,
      max_daily_loss: 200,
      max_drawdown: 300,
      max_open_positions: 3,
      effective_from: now,
      active: true,
      created_at: now,
      updated_at: now,
    });

    await insertIfMissing(db, "feature_set_versions", {
      id: featureSetId,
      label: "Seeded Features",
      description: "Seeded feature set for e2e.",
      created_at: now,
      updated_at: now,
    });

    await insertIfMissing(db, "dataset_versions", {
      id: datasetVersionId,
      pair: "Gold-USDT",
      interval: "1m",
      start_at: twoHoursAgo,
      end_at: now,
      checksum: "seeded-dataset-checksum",
      dataset_hash: "seeded-dataset-checksum",
      window_size: 30,
      stride: 1,
      feature_set_version_id: featureSetId,
      created_at: now,
      updated_at: now,
    });

    await insertIfMissing(db, "model_artifacts", {
      id: artifactId,
      agent_version_id: agentVersionId,
      artifact_uri: "convex://storage/seeded-artifact",
      artifact_checksum: "seeded-checksum",
      artifact_size_bytes: 16,
      content_type: "application/zip",
      training_window_start: twoHoursAgo,
      training_window_end: now,
      created_at: now,
      updated_at: now,
    });

    await insertIfMissing(db, "agent_versions", {
      id: agentVersionId,
      name: "Seeded Version",
      status: "promoted",
      dataset_version_id: datasetVersionId,
      dataset_hash: "seeded-dataset-checksum",
      feature_set_version_id: featureSetId,
      artifact_uri: "convex://storage/seeded-artifact",
      artifact_checksum: "seeded-checksum",
      artifact_size_bytes: 16,
      promoted_at: now,
      created_at: now,
      updated_at: now,
    });

    await insertIfMissing(db, "agent_versions", {
      id: retiredAgentVersionId,
      name: "Seeded Retired Version",
      status: "retired",
      dataset_version_id: datasetVersionId,
      dataset_hash: "seeded-dataset-checksum",
      feature_set_version_id: featureSetId,
      artifact_uri: "convex://storage/seeded-artifact",
      artifact_checksum: "seeded-checksum",
      artifact_size_bytes: 16,
      promoted_at: null,
      created_at: now,
      updated_at: now,
    });

    await insertIfMissing(db, "trades", {
      id: tradeId,
      signal_id: signalId,
      agent_config_id: null,
      agent_run_id: null,
      instrument: "Gold-USDT",
      side: "long",
      quantity: 1,
      status: "filled",
      mode: "paper",
      client_order_id: "seeded-trade-1",
      position_size: 1,
      pnl: 0,
      pnl_pct: 0,
      closed_at: null,
      created_at: now,
      updated_at: now,
    });

    await insertIfMissing(db, "trade_executions", {
      id: tradeExecutionId,
      trade_id: tradeId,
      trade_decision_id: null,
      execution_kind: "entry",
      exchange_order_id: "seeded-exec-1",
      execution_mode: "paper",
      requested_instrument: "Gold-USDT",
      requested_side: "long",
      requested_quantity: 1,
      filled_quantity: 1,
      average_price: 2300,
      status: "filled",
      executed_at: oneHourAgo,
      created_at: now,
      updated_at: now,
    });

    await insertIfMissing(db, "ops_alerts", {
      id: opsAlertId,
      category: "ops",
      severity: "low",
      metric: "seeded_alert",
      value: 1,
      threshold: 0,
      status: "open",
      triggered_at: now,
      created_at: now,
      updated_at: now,
    });

    await insertIfMissing(db, "retry_queue", {
      id: retryQueueId,
      job_type: "seeded_job",
      payload: { seed: true },
      status: "pending",
      attempts: 0,
      max_attempts: 3,
      next_attempt_at: now,
      dedupe_key: "seeded-job",
      created_at: now,
      updated_at: now,
    });

    const pairs = ["Gold-USDT", "XAUTUSDT", "PAXGUSDT"];
    const sources = [
      "bingx_candles",
      "bingx_orderbook",
      "bingx_trades",
      "bingx_funding",
      "bingx_open_interest",
      "bingx_mark_price",
      "bingx_index_price",
      "bingx_ticker",
      "ideas",
      "signals",
      "news",
      "ocr_text",
      "trades",
    ];

    for (const pair of pairs) {
      for (const source of sources) {
        await insertIfMissing(db, "data_source_status", {
          id: `${pair}:${source}`,
          pair,
          source_type: source,
          last_seen_at: now,
          freshness_threshold_seconds: 120,
          status: "ok",
          updated_at: now,
          created_at: now,
        });
      }
    }

    return {
      ok: true,
      seeded: {
        ideaId,
        tradeId,
        agentVersionId,
        riskLimitId,
      },
    };
  },
});
