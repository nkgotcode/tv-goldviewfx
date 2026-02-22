import { Hono } from "hono";
import { z } from "zod";
import { getSupportedPairs, listMarketInstruments } from "../../config/market_catalog";
import { requireOperatorRole, withOpsIdentity } from "../middleware/rbac";
import { validateJson } from "../middleware/validate";
import { runBingxMarketDataIngest } from "../../services/bingx_market_data_ingest";
import { BINGX_SOURCE_TYPES, listDataSourceStatusWithConfig } from "../../services/data_source_status_service";
import { tradingPairSchema } from "../../rl/schemas";
import { recordOpsAudit } from "../../services/ops_audit";
import { listBingxCandles } from "../../db/repositories/bingx_market_data/candles";

const bingxIngestSchema = z.object({
  pairs: z.array(tradingPairSchema).optional(),
  intervals: z.array(z.string()).optional(),
  maxBatches: z.number().int().positive().optional(),
});

const bingxCandlesQuerySchema = z.object({
  pair: tradingPairSchema.optional(),
  interval: z.string().min(1).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  limit: z
    .preprocess((value) => (value === undefined ? undefined : Number(value)), z.number().int().positive().max(5000))
    .optional(),
});

export const bingxMarketDataRoutes = new Hono();

bingxMarketDataRoutes.use("*", withOpsIdentity);

bingxMarketDataRoutes.get("/pairs", async (c) => {
  const section = c.req.query("section");
  const instruments = listMarketInstruments();
  const filtered =
    section === "gold" || section === "crypto"
      ? instruments.filter((instrument) => instrument.section === section)
      : instruments;
  return c.json({ data: filtered });
});

bingxMarketDataRoutes.get("/status", async (c) => {
  const pair = c.req.query("pair") as z.infer<typeof tradingPairSchema> | undefined;
  const statuses = await listDataSourceStatusWithConfig(pair);
  const filtered = statuses.filter((status) => BINGX_SOURCE_TYPES.includes(status.sourceType));
  return c.json(
    filtered.map((status) => ({
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

bingxMarketDataRoutes.get("/candles", async (c) => {
  const parsed = bingxCandlesQuerySchema.safeParse({
    pair: c.req.query("pair"),
    interval: c.req.query("interval"),
    start: c.req.query("start"),
    end: c.req.query("end"),
    limit: c.req.query("limit"),
  });
  if (!parsed.success) {
    return c.json({ error: parsed.error.message }, 400);
  }
  const pair = parsed.data.pair ?? getSupportedPairs()[0] ?? "XAUTUSDT";
  const interval = parsed.data.interval ?? "1m";
  const limit = parsed.data.limit ?? 500;
  const candles = await listBingxCandles({
    pair,
    interval,
    start: parsed.data.start,
    end: parsed.data.end,
    limit,
  });
  return c.json({ data: candles });
});

bingxMarketDataRoutes.post("/backfill", requireOperatorRole, validateJson(bingxIngestSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof bingxIngestSchema>;
  await runBingxMarketDataIngest({
    pairs: payload.pairs,
    intervals: payload.intervals,
    maxBatches: payload.maxBatches,
    backfill: true,
  });
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "bingx.backfill",
    resource_type: "bingx",
    metadata: payload,
  });
  return c.json({ status: "accepted" }, 202);
});

bingxMarketDataRoutes.post("/refresh", requireOperatorRole, validateJson(bingxIngestSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof bingxIngestSchema>;
  await runBingxMarketDataIngest({
    pairs: payload.pairs,
    intervals: payload.intervals,
    maxBatches: payload.maxBatches,
    backfill: false,
  });
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "bingx.refresh",
    resource_type: "bingx",
    metadata: payload,
  });
  return c.json({ status: "accepted" }, 202);
});
