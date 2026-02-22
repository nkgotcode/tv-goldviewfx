import { Hono } from "hono";
import { z } from "zod";
import { getSupportedPairs, resolveSupportedPair } from "../../config/market_catalog";
import { requireOperatorRole, withOpsIdentity } from "../middleware/rbac";
import { validateJson } from "../middleware/validate";
import { dataSourceConfigSchema, tradingPairSchema } from "../../rl/schemas";
import {
  getDefaultThreshold,
  listDataSourceStatusWithConfig,
  upsertDataSourceConfigRecord,
} from "../../services/data_source_status_service";
import { listSyncRuns } from "../../db/repositories/sync_runs";
import { getSourceById, listSourcesByType } from "../../db/repositories/sources";
import { runTradingViewSync } from "../../services/tradingview_sync";
import { runTelegramIngest } from "../../services/telegram_ingest";
import { runBingxMarketDataIngest } from "../../services/bingx_market_data_ingest";
import { recordOpsAudit } from "../../services/ops_audit";

const dataSourceBackfillSchema = z.object({
  sourceType: z.string().min(1),
  pair: tradingPairSchema,
  start: z.string().datetime(),
  end: z.string().datetime(),
});

export const dataSourcesRoutes = new Hono();

dataSourcesRoutes.use("*", withOpsIdentity);

dataSourcesRoutes.get("/status", async (c) => {
  const pair = c.req.query("pair") as z.infer<typeof tradingPairSchema> | undefined;
  const statuses = await listDataSourceStatusWithConfig(pair);
  return c.json(
    statuses.map((status) => ({
      pair: status.pair,
      source_type: status.sourceType,
      enabled: status.enabled,
      status: status.status,
      last_seen_at: status.lastSeenAt,
      freshness_threshold_seconds: status.freshnessThresholdSeconds,
      updated_at: status.updatedAt,
    })),
  );
});

dataSourcesRoutes.patch("/config", requireOperatorRole, validateJson(dataSourceConfigSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof dataSourceConfigSchema>;
  const sources = payload.sources ?? [];
  const updatedSources = [];

  for (const source of sources) {
    const threshold = source.freshnessThresholdSeconds ?? getDefaultThreshold(source.sourceType);
    for (const pair of getSupportedPairs()) {
      const updated = await upsertDataSourceConfigRecord({
        pair,
        sourceType: source.sourceType,
        enabled: source.enabled,
        freshnessThresholdSeconds: threshold,
      });
      updatedSources.push({
        pair: updated.pair,
        sourceType: updated.source_type,
        enabled: updated.enabled,
        freshnessThresholdSeconds: updated.freshness_threshold_seconds,
      });
    }
  }

  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "data_sources.config.update",
    resource_type: "data_source_config",
    metadata: payload,
  });
  return c.json({ sources: updatedSources });
});

dataSourcesRoutes.get("/runs", async (c) => {
  const sourceType = c.req.query("sourceType") ?? undefined;
  const defaultPair = getSupportedPairs()[0] ?? "XAUTUSDT";
  const pair = (c.req.query("pair") as z.infer<typeof tradingPairSchema> | undefined) ?? defaultPair;
  const runs = await listSyncRuns();

  const enriched = await Promise.all(
    runs.map(async (run) => {
      const source = await getSourceById(run.source_id);
      const mappedSourceType =
        source.type === "tradingview" ? "ideas" : source.type === "telegram" ? "signals" : source.type;
      const mappedPair =
        source.type === "bingx" && source.identifier.startsWith("bingx-")
          ? (resolveSupportedPair(source.identifier.replace("bingx-", "")) ?? source.identifier.replace("bingx-", ""))
          : pair;
      return {
        id: run.id,
        sourceType: mappedSourceType,
        pair: mappedPair,
        status: run.status,
        startedAt: run.started_at,
        finishedAt: run.finished_at,
        newCount: run.new_count,
        updatedCount: run.updated_count,
        errorCount: run.error_count,
        errorSummary: run.error_summary,
      };
    }),
  );

  const filtered = sourceType ? enriched.filter((run) => run.sourceType === sourceType) : enriched;
  return c.json(filtered);
});

dataSourcesRoutes.post("/backfill", requireOperatorRole, validateJson(dataSourceBackfillSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof dataSourceBackfillSchema>;
  if (payload.sourceType.startsWith("bingx_")) {
    await runBingxMarketDataIngest({ pairs: [payload.pair], backfill: true });
    await recordOpsAudit({
      actor: c.get("opsActor") ?? "system",
      action: "data_sources.backfill",
      resource_type: "bingx",
      metadata: payload,
    });
    return c.json({ status: "accepted" }, 202);
  }
  if (payload.sourceType === "ideas") {
    await runTradingViewSync({ trigger: "manual" });
    await recordOpsAudit({
      actor: c.get("opsActor") ?? "system",
      action: "data_sources.backfill",
      resource_type: "tradingview",
      metadata: payload,
    });
    return c.json({ status: "accepted" }, 202);
  }
  if (payload.sourceType === "signals") {
    const sources = await listSourcesByType("telegram");
    const source = sources[0];
    if (!source) {
      return c.json({ error: "No telegram source configured" }, 400);
    }
    await runTelegramIngest({ sourceId: source.id, trigger: "manual" });
    await recordOpsAudit({
      actor: c.get("opsActor") ?? "system",
      action: "data_sources.backfill",
      resource_type: "telegram",
      metadata: payload,
    });
    return c.json({ status: "accepted" }, 202);
  }
  return c.json({ error: "Unsupported source type" }, 400);
});
