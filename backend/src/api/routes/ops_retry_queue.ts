import { Hono } from "hono";
import { listRetryQueueItems } from "../../db/repositories/retry_queue";
import { requireOperatorRole, withOpsIdentity } from "../middleware/rbac";

export const opsRetryQueueRoutes = new Hono();

opsRetryQueueRoutes.use("*", withOpsIdentity);

opsRetryQueueRoutes.get("/", requireOperatorRole, async (c) => {
  const limit = Number.parseInt(c.req.query("limit") ?? "50", 10);
  const items = await listRetryQueueItems(Number.isFinite(limit) ? limit : 50);
  return c.json(items);
});
