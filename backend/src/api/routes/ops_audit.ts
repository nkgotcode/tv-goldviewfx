import { Hono } from "hono";
import { listOpsAuditEvents } from "../../db/repositories/ops_audit_events";
import { logWarn } from "../../services/logger";

export const opsAuditRoutes = new Hono();

opsAuditRoutes.get("/", async (c) => {
  const limit = Number.parseInt(c.req.query("limit") ?? "100", 10);
  try {
    const events = await listOpsAuditEvents(Number.isNaN(limit) ? 100 : limit);
    return c.json({ data: events });
  } catch (error) {
    logWarn("Failed to load ops audit events", { error: String(error) });
    return c.json({ data: [] });
  }
});
