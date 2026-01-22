import { Hono } from "hono";
import { tradingPairSchema } from "../../rl/schemas";
import { getDataGapHealth } from "../../services/data_gap_health";
import { logWarn } from "../../services/logger";
import type { TradingPair } from "../../types/rl";

export const opsGapsRoutes = new Hono();

opsGapsRoutes.get("/health", async (c) => {
  const pairParam = c.req.query("pair");
  const sourceType = c.req.query("source_type") ?? undefined;
  const limitParam = c.req.query("limit");
  if (pairParam && !tradingPairSchema.safeParse(pairParam).success) {
    return c.json({ error: "Invalid pair" }, 400);
  }
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
  if (limitParam && (!Number.isFinite(limit) || (limit ?? 0) <= 0)) {
    return c.json({ error: "Invalid limit" }, 400);
  }
  try {
    const health = await getDataGapHealth({
      pair: pairParam as TradingPair | undefined,
      sourceType,
      limit,
    });
    return c.json(health);
  } catch (error) {
    logWarn("Failed to load data gap health", { error: String(error) });
    return c.json({
      generated_at: new Date().toISOString(),
      totals: { open: 0, healing: 0, last_detected_at: null, last_seen_at: null, oldest_open_at: null },
      by_pair: [],
      by_source: [],
      open_events: [],
    });
  }
});
