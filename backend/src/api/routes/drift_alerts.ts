import { Hono } from "hono";
import { listDriftAlerts } from "../../db/repositories/drift_alerts";

export const driftAlertsRoutes = new Hono();

driftAlertsRoutes.get("/:agentId/drift-alerts", async (c) => {
  const agentId = c.req.param("agentId");
  const alerts = await listDriftAlerts(agentId);
  return c.json(alerts);
});
