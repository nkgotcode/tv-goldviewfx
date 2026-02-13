import { Hono } from "hono";
import { z } from "zod";
import { requireOperatorRole } from "../middleware/rbac";
import { validateJson } from "../middleware/validate";
import { getOrCreateSource, listSourcesByType } from "../../db/repositories/sources";
import { listTelegramPosts } from "../../db/repositories/telegram_posts";
import { runTelegramIngest } from "../../services/telegram_ingest";
import { parsePagination } from "../utils/pagination";
import { recordOpsAudit } from "../../services/ops_audit";

export const telegramRoutes = new Hono();

const sourceSchema = z.object({
  type: z.literal("telegram"),
  identifier: z.string().min(1),
  display_name: z.string().optional(),
});

const ingestSchema = z.object({
  source_id: z.string().uuid(),
});

telegramRoutes.get("/sources", async (c) => {
  const sources = await listSourcesByType("telegram");
  return c.json(sources);
});

telegramRoutes.post("/sources", requireOperatorRole, validateJson(sourceSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof sourceSchema>;
  const source = await getOrCreateSource(payload.type, payload.identifier, payload.display_name);
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "telegram.source.create",
    resource_type: "telegram_source",
    resource_id: source.id,
    metadata: payload,
  });
  return c.json(source, 201);
});

telegramRoutes.post("/ingest", requireOperatorRole, validateJson(ingestSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof ingestSchema>;
  const result = await runTelegramIngest({ sourceId: payload.source_id, trigger: "manual" });
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "telegram.ingest",
    resource_type: "telegram_source",
    resource_id: payload.source_id,
  });
  return c.json(result, 202);
});

telegramRoutes.get("/posts", async (c) => {
  const includeDuplicates = c.req.query("include_duplicates") === "true";
  const { page, pageSize } = parsePagination(c);
  const posts = await listTelegramPosts({
    sourceId: c.req.query("source_id") ?? undefined,
    status: c.req.query("status") ?? undefined,
    includeDuplicates,
    query: c.req.query("q") ?? undefined,
    start: c.req.query("start") ?? undefined,
    end: c.req.query("end") ?? undefined,
    page,
    pageSize,
  });
  return c.json(posts);
});
