import { Hono } from "hono";
import { getTradingSummary, getTradingMetrics } from "../../services/trade_analytics";
import { logWarn } from "../../services/logger";
import { reconcileTradeExecutions } from "../../services/trade_reconciliation";
import { getAccountRiskSummary } from "../../services/account_risk_service";
import { requireOperatorRole, withOpsIdentity } from "../middleware/rbac";
import { recordOpsAudit } from "../../services/ops_audit";

export const opsTradingRoutes = new Hono();

opsTradingRoutes.use("*", withOpsIdentity);

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

opsTradingRoutes.post("/reconcile", requireOperatorRole, async (c) => {
  try {
    const result = await reconcileTradeExecutions();
    await recordOpsAudit({
      actor: c.get("opsActor") ?? "system",
      action: "trading.reconcile",
      resource_type: "trade_execution",
      metadata: result,
    });
    return c.json({ ...result, reconciled_at: new Date().toISOString() });
  } catch (error) {
    logWarn("Failed to reconcile trades", { error: String(error) });
    return c.json({ error: "reconcile_failed" }, 500);
  }
});

opsTradingRoutes.get("/risk", async (c) => {
  try {
    const summary = await getAccountRiskSummary();
    return c.json(summary);
  } catch (error) {
    logWarn("Failed to load account risk summary", { error: String(error) });
    return c.json({ error: "risk_summary_failed" }, 500);
  }
});
