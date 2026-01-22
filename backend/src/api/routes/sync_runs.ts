import { Hono } from "hono";
import { listSyncRuns } from "../../db/repositories/sync_runs";

export const syncRunsRoutes = new Hono();

syncRunsRoutes.get("/", async (c) => {
  const sourceId = c.req.query("source_id") ?? undefined;
  const runs = await listSyncRuns(sourceId);
  return c.json(runs);
});
