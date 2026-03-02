import { Hono } from "hono";
import { z } from "zod";
import { listDriftAlerts, updateDriftAlert } from "../../db/repositories/drift_alerts";
import { logWarn } from "../../services/logger";
import { requireOperatorRole, withOpsIdentity } from "../middleware/rbac";
import { validateJson } from "../middleware/validate";
import { recordOpsAudit } from "../../services/ops_audit";

export const driftAlertsRoutes = new Hono();

driftAlertsRoutes.use("*", withOpsIdentity);

const driftAlertUpdateSchema = z.object({
  status: z.enum(["open", "acknowledged", "resolved"]),
  action_taken: z.string().nullable().optional(),
});

const driftAlertBulkResolveSchema = z.object({
  before: z.string().datetime().optional(),
  action_taken: z.string().optional(),
});

driftAlertsRoutes.get("/:agentId/drift-alerts", async (c) => {
  const agentId = c.req.param("agentId");
  try {
    const alerts = await listDriftAlerts(agentId);
    return c.json(alerts);
  } catch (error) {
    logWarn("Failed to load drift alerts", { error: String(error), agentId });
    return c.json([]);
  }
});

driftAlertsRoutes.patch(
  "/:agentId/drift-alerts/:alertId",
  requireOperatorRole,
  validateJson(driftAlertUpdateSchema),
  async (c) => {
    const agentId = c.req.param("agentId");
    const alertId = c.req.param("alertId");
    try {
      const payload = c.get("validatedBody") as z.infer<typeof driftAlertUpdateSchema>;
      const updated = await updateDriftAlert(alertId, {
        status: payload.status,
        action_taken: payload.action_taken ?? null,
      });
      await recordOpsAudit({
        actor: c.get("opsActor") ?? "system",
        action: "drift_alert.update",
        resource_type: "drift_alert",
        resource_id: updated.id,
        metadata: {
          agent_id: agentId,
          status: payload.status,
          action_taken: payload.action_taken ?? null,
        },
      });
      return c.json(updated);
    } catch (error) {
      logWarn("Failed to update drift alert", { error: String(error), agentId, alertId });
      return c.json({ error: "drift_alert_update_failed" }, 500);
    }
  },
);

driftAlertsRoutes.post(
  "/:agentId/drift-alerts/resolve-open",
  requireOperatorRole,
  validateJson(driftAlertBulkResolveSchema),
  async (c) => {
    const agentId = c.req.param("agentId");
    const payload = c.get("validatedBody") as z.infer<typeof driftAlertBulkResolveSchema>;
    const beforeDate = payload.before ? new Date(payload.before) : null;
    const beforeTime = beforeDate && Number.isFinite(beforeDate.getTime()) ? beforeDate.getTime() : null;
    const actionTaken = payload.action_taken ?? "manual_resolve";

    try {
      const alerts = await listDriftAlerts(agentId);
      const targetIds = alerts
        .filter((alert) => alert.status === "open")
        .filter((alert) => {
          if (!beforeTime) return true;
          const detectedAt = new Date(alert.detected_at).getTime();
          if (!Number.isFinite(detectedAt)) return false;
          return detectedAt <= beforeTime;
        })
        .map((alert) => alert.id);

      const updated = await Promise.all(
        targetIds.map((id) =>
          updateDriftAlert(id, {
            status: "resolved",
            action_taken: actionTaken,
          }),
        ),
      );

      await recordOpsAudit({
        actor: c.get("opsActor") ?? "system",
        action: "drift_alert.resolve_open",
        resource_type: "drift_alert",
        metadata: {
          agent_id: agentId,
          before: payload.before ?? null,
          resolved_count: updated.length,
          action_taken: actionTaken,
        },
      });

      return c.json({
        resolved: updated.length,
        ids: updated.map((item) => item.id),
      });
    } catch (error) {
      logWarn("Failed to resolve open drift alerts", { error: String(error), agentId, before: payload.before ?? null });
      return c.json({ error: "drift_alert_bulk_resolve_failed" }, 500);
    }
  },
);
