import { Hono } from "hono";
import { z } from "zod";
import { validateJson } from "../middleware/validate";
import { withOpsIdentity, requireOperatorRole } from "../middleware/rbac";
import { getOpsIngestionStatus } from "../../services/ingestion_status";
import { listIngestionRuns } from "../../db/repositories/ingestion_runs";
import { listIngestionConfigs, upsertIngestionConfig } from "../../db/repositories/ingestion_configs";
import { runTradingViewSync } from "../../services/tradingview_sync";
import { runTelegramIngest } from "../../services/telegram_ingest";
import { runBingxMarketDataIngest } from "../../services/bingx_market_data_ingest";
import { recordOpsAudit } from "../../services/ops_audit";
import { logWarn } from "../../services/logger";
import { tradingPairSchema } from "../../rl/schemas";

const configSchema = z.object({
  source_type: z.string(),
  source_id: z.string().uuid().nullable().optional(),
  feed: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  refresh_interval_seconds: z.number().int().nonnegative().optional(),
  backfill_max_days: z.number().int().nonnegative().optional(),
  rate_limit_per_minute: z.number().int().nonnegative().optional(),
  backoff_base_seconds: z.number().int().nonnegative().optional(),
  backoff_max_seconds: z.number().int().nonnegative().optional(),
  config: z.record(z.any()).optional(),
});

const runSchema = z.object({
  source_id: z.string().uuid().optional(),
  feed: z.string().optional(),
  full_content: z.boolean().optional(),
  include_updates: z.boolean().optional(),
  pairs: z.array(tradingPairSchema).optional(),
  intervals: z.array(z.string().min(1)).optional(),
  max_batches: z.number().int().positive().optional(),
});

export const opsIngestionRoutes = new Hono();

opsIngestionRoutes.use("*", withOpsIdentity);

opsIngestionRoutes.get("/status", async (c) => {
  if (process.env.NODE_ENV === "test") {
    return c.json({ generated_at: new Date().toISOString(), sources: [] });
  }
  try {
    const status = await getOpsIngestionStatus();
    return c.json(status);
  } catch (error) {
    logWarn("Failed to load ops ingestion status", { error: String(error) });
    return c.json({ generated_at: new Date().toISOString(), sources: [] });
  }
});

opsIngestionRoutes.get("/runs", async (c) => {
  if (process.env.NODE_ENV === "test") {
    return c.json({ data: [], total: 0 });
  }
  const sourceType = c.req.query("source_type");
  const sourceId = c.req.query("source_id");
  const feed = c.req.query("feed");
  const page = Number.parseInt(c.req.query("page") ?? "1", 10);
  const pageSize = Number.parseInt(c.req.query("page_size") ?? "25", 10);
  try {
    const result = await listIngestionRuns({
      sourceType: sourceType ?? undefined,
      sourceId: sourceId ? sourceId : undefined,
      feed: feed ?? undefined,
      page,
      pageSize,
    });
    return c.json(result);
  } catch (error) {
    logWarn("Failed to load ingestion runs", { error: String(error) });
    return c.json({ data: [], total: 0 });
  }
});

opsIngestionRoutes.get("/config", async (c) => {
  const sourceType = c.req.query("source_type");
  const sourceId = c.req.query("source_id");
  const feed = c.req.query("feed");
  try {
    const configs = await listIngestionConfigs({
      sourceType: sourceType ?? undefined,
      sourceId: sourceId ? sourceId : undefined,
      feed: feed ?? undefined,
    });
    return c.json({ data: configs });
  } catch (error) {
    logWarn("Failed to load ingestion configs", { error: String(error) });
    return c.json({ data: [] });
  }
});

opsIngestionRoutes.put("/config", requireOperatorRole, validateJson(configSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof configSchema>;
  const config = await upsertIngestionConfig({
    source_type: payload.source_type,
    source_id: payload.source_id ?? null,
    feed: payload.feed ?? null,
    enabled: payload.enabled,
    refresh_interval_seconds: payload.refresh_interval_seconds ?? null,
    backfill_max_days: payload.backfill_max_days ?? null,
    rate_limit_per_minute: payload.rate_limit_per_minute ?? null,
    backoff_base_seconds: payload.backoff_base_seconds ?? null,
    backoff_max_seconds: payload.backoff_max_seconds ?? null,
    config: payload.config ?? {},
  });
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "ingestion.config.update",
    resource_type: "ingestion_config",
    resource_id: config.id,
    metadata: payload,
  });
  return c.json(config);
});

opsIngestionRoutes.post("/:source/run", requireOperatorRole, validateJson(runSchema), async (c) => {
  const source = c.req.param("source");
  const payload = c.get("validatedBody") as z.infer<typeof runSchema>;
  let result: unknown = null;
  if (source === "tradingview") {
    result = await runTradingViewSync({
      trigger: "manual",
      sourceId: payload.source_id,
      fetchFull: payload.full_content,
      includeUpdates: payload.include_updates,
    });
  } else if (source === "telegram") {
    if (!payload.source_id) {
      return c.json({ error: "source_id is required" }, 400);
    }
    result = await runTelegramIngest({ sourceId: payload.source_id, trigger: "manual" });
  } else if (source === "bingx") {
    result = await runBingxMarketDataIngest({
      pairs: payload.pairs,
      intervals: payload.intervals,
      maxBatches: payload.max_batches,
      backfill: false,
      trigger: "manual",
    });
  } else {
    return c.json({ error: "Unknown source" }, 400);
  }

  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "ingestion.run",
    resource_type: source,
    resource_id: payload.source_id ?? payload.feed ?? null,
    metadata: payload,
  });

  return c.json(result, 202);
});

opsIngestionRoutes.post("/:source/backfill", requireOperatorRole, validateJson(runSchema), async (c) => {
  const source = c.req.param("source");
  const payload = c.get("validatedBody") as z.infer<typeof runSchema>;
  let result: unknown = null;
  if (source === "tradingview") {
    result = await runTradingViewSync({
      trigger: "manual",
      sourceId: payload.source_id,
      fetchFull: payload.full_content ?? true,
      includeUpdates: payload.include_updates,
    });
  } else if (source === "telegram") {
    if (!payload.source_id) {
      return c.json({ error: "source_id is required" }, 400);
    }
    result = await runTelegramIngest({ sourceId: payload.source_id, trigger: "manual" });
  } else if (source === "bingx") {
    result = await runBingxMarketDataIngest({
      pairs: payload.pairs,
      intervals: payload.intervals,
      maxBatches: payload.max_batches,
      backfill: true,
      trigger: "manual",
    });
  } else {
    return c.json({ error: "Unknown source" }, 400);
  }

  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "ingestion.backfill",
    resource_type: source,
    resource_id: payload.source_id ?? payload.feed ?? null,
    metadata: payload,
  });

  return c.json(result, 202);
});

opsIngestionRoutes.post("/:source/pause", requireOperatorRole, validateJson(runSchema), async (c) => {
  const source = c.req.param("source");
  const payload = c.get("validatedBody") as z.infer<typeof runSchema>;
  if (source === "bingx" && !payload.feed) {
    return c.json({ error: "feed is required for BingX" }, 400);
  }
  const config = await upsertIngestionConfig({
    source_type: source,
    source_id: payload.source_id ?? null,
    feed: payload.feed ?? null,
    enabled: false,
  });
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "ingestion.pause",
    resource_type: source,
    resource_id: payload.source_id ?? payload.feed ?? null,
    metadata: payload,
  });
  return c.json(config);
});

opsIngestionRoutes.post("/:source/resume", requireOperatorRole, validateJson(runSchema), async (c) => {
  const source = c.req.param("source");
  const payload = c.get("validatedBody") as z.infer<typeof runSchema>;
  if (source === "bingx" && !payload.feed) {
    return c.json({ error: "feed is required for BingX" }, 400);
  }
  const config = await upsertIngestionConfig({
    source_type: source,
    source_id: payload.source_id ?? null,
    feed: payload.feed ?? null,
    enabled: true,
  });
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "ingestion.resume",
    resource_type: source,
    resource_id: payload.source_id ?? payload.feed ?? null,
    metadata: payload,
  });
  return c.json(config);
});
