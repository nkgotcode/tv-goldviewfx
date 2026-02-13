import { Hono } from "hono";
import { z } from "zod";
import { requireOperatorRole } from "../middleware/rbac";
import { validateJson } from "../middleware/validate";
import { tradingPairSchema } from "../../rl/schemas";
import { runTradingViewSync } from "../../services/tradingview_sync";
import { runTelegramIngest } from "../../services/telegram_ingest";
import { runBingxMarketDataIngest } from "../../services/bingx_market_data_ingest";
import { getIngestionStatus } from "../../services/ingestion_status";
import { recordOpsAudit } from "../../services/ops_audit";

const syncRequestSchema = z.object({
  source_id: z.string().optional(),
  full_content: z.boolean().optional(),
  include_updates: z.boolean().optional(),
});

const telegramIngestSchema = z.object({
  source_id: z.string().uuid(),
});

const bingxRequestSchema = z.object({
  pairs: z.array(tradingPairSchema).optional(),
  intervals: z.array(z.string().min(1)).optional(),
  max_batches: z.number().int().positive().optional(),
});

export const ingestionRoutes = new Hono();

ingestionRoutes.get("/status", async (c) => {
  const status = await getIngestionStatus();
  return c.json(status);
});

ingestionRoutes.post("/tradingview/sync", requireOperatorRole, validateJson(syncRequestSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof syncRequestSchema>;
  const result = await runTradingViewSync({
    trigger: "manual",
    sourceId: payload.source_id,
    fetchFull: payload.full_content,
    includeUpdates: payload.include_updates,
  });
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "ingestion.tradingview.sync",
    resource_type: "tradingview",
    metadata: payload,
  });
  return c.json(result, 202);
});

ingestionRoutes.post("/telegram/ingest", requireOperatorRole, validateJson(telegramIngestSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof telegramIngestSchema>;
  const result = await runTelegramIngest({ sourceId: payload.source_id, trigger: "manual" });
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "ingestion.telegram.ingest",
    resource_type: "telegram",
    resource_id: payload.source_id,
  });
  return c.json(result, 202);
});

ingestionRoutes.post("/bingx/backfill", requireOperatorRole, validateJson(bingxRequestSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof bingxRequestSchema>;
  const result = await runBingxMarketDataIngest({
    pairs: payload.pairs,
    intervals: payload.intervals,
    maxBatches: payload.max_batches,
    backfill: true,
    trigger: "manual",
  });
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "ingestion.bingx.backfill",
    resource_type: "bingx",
    metadata: payload,
  });
  return c.json(result, 202);
});

ingestionRoutes.post("/bingx/refresh", requireOperatorRole, validateJson(bingxRequestSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof bingxRequestSchema>;
  const result = await runBingxMarketDataIngest({
    pairs: payload.pairs,
    intervals: payload.intervals,
    maxBatches: payload.max_batches ?? 1,
    backfill: false,
    trigger: "manual",
  });
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "ingestion.bingx.refresh",
    resource_type: "bingx",
    metadata: payload,
  });
  return c.json(result, 202);
});
