import { Hono } from "hono";
import { z } from "zod";
import { validateJson } from "../middleware/validate";
import { listNewsSources } from "../../db/repositories/news_sources";
import { listNewsItems } from "../../db/repositories/news_items";
import { runNewsIngest } from "../../services/news_ingest";
import { requireOperatorRole } from "../middleware/rbac";
import { recordOpsAudit } from "../../services/ops_audit";

const ingestSchema = z.object({});

export const newsRoutes = new Hono();

newsRoutes.get("/sources", async (c) => {
  const sources = await listNewsSources();
  return c.json({ data: sources });
});

newsRoutes.get("/items", async (c) => {
  const sourceId = c.req.query("source_id") ?? undefined;
  const start = c.req.query("start") ?? undefined;
  const end = c.req.query("end") ?? undefined;
  const page = Number.parseInt(c.req.query("page") ?? "1", 10);
  const pageSize = Number.parseInt(c.req.query("page_size") ?? "10", 10);
  const items = await listNewsItems({ sourceId, start, end, page, pageSize });
  return c.json(items);
});

newsRoutes.post("/ingest", requireOperatorRole, validateJson(ingestSchema), async (c) => {
  const result = await runNewsIngest("manual");
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "news.ingest",
    resource_type: "news",
  });
  return c.json(result, 202);
});
