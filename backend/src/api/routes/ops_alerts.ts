import { Hono } from "hono";
import { listOpsAlerts } from "../../db/repositories/ops_alerts";

export const opsAlertsRoutes = new Hono();

opsAlertsRoutes.get("/", async (c) => {
  const limit = Number.parseInt(c.req.query("limit") ?? "100", 10);
  const alerts = await listOpsAlerts(Number.isFinite(limit) ? limit : 100);
  return c.json(alerts);
});
