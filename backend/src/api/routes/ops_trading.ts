import { Hono } from "hono";
import { getTradingSummary, getTradingMetrics } from "../../services/trade_analytics";
import { logWarn } from "../../services/logger";

export const opsTradingRoutes = new Hono();

opsTradingRoutes.get("/summary", async (c) => {
  try {
    const summary = await getTradingSummary();
    return c.json(summary);
  } catch (error) {
    logWarn("Failed to load trading summary", { error: String(error) });
    return c.json({
      generated_at: new Date().toISOString(),
      trade_count: 0,
      filled_count: 0,
      win_rate: 0,
      net_pnl: 0,
      avg_pnl: 0,
      max_drawdown: 0,
      exposure_by_instrument: {},
    });
  }
});

opsTradingRoutes.get("/metrics", async (c) => {
  try {
    const metrics = await getTradingMetrics();
    return c.json(metrics);
  } catch (error) {
    logWarn("Failed to load trading metrics", { error: String(error) });
    return c.json({ generated_at: new Date().toISOString(), series: [] });
  }
});
