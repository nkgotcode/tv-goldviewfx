import { Hono } from "hono";
import { z } from "zod";
import { validateJson } from "../middleware/validate";
import { runBingxMarketDataIngest } from "../../services/bingx_market_data_ingest";
import { BINGX_SOURCE_TYPES, listDataSourceStatusWithConfig } from "../../services/data_source_status_service";
import { tradingPairSchema } from "../../rl/schemas";

const bingxIngestSchema = z.object({
  pairs: z.array(tradingPairSchema).optional(),
  intervals: z.array(z.string()).optional(),
  maxBatches: z.number().int().positive().optional(),
});

export const bingxMarketDataRoutes = new Hono();

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

bingxMarketDataRoutes.post("/backfill", validateJson(bingxIngestSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof bingxIngestSchema>;
  await runBingxMarketDataIngest({
    pairs: payload.pairs,
    intervals: payload.intervals,
    maxBatches: payload.maxBatches,
    backfill: true,
  });
  return c.json({ status: "accepted" }, 202);
});

bingxMarketDataRoutes.post("/refresh", validateJson(bingxIngestSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof bingxIngestSchema>;
  await runBingxMarketDataIngest({
    pairs: payload.pairs,
    intervals: payload.intervals,
    maxBatches: payload.maxBatches,
    backfill: false,
  });
  return c.json({ status: "accepted" }, 202);
});
