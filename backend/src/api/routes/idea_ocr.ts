import { Hono } from "hono";
import { z } from "zod";
import { validateJson } from "../middleware/validate";
import { listIdeaMedia } from "../../db/repositories/idea_media";
import { runOcrBatch } from "../../services/ocr";
import { requireOperatorRole } from "../middleware/rbac";

const runSchema = z.object({
  limit: z.number().int().positive().optional(),
});

export const ideaOcrRoutes = new Hono();

ideaOcrRoutes.get("/:ideaId", async (c) => {
  const ideaId = c.req.param("ideaId");
  const media = await listIdeaMedia(ideaId);
  return c.json({ data: media });
});

ideaOcrRoutes.post("/run", requireOperatorRole, validateJson(runSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof runSchema>;
  const result = await runOcrBatch(payload.limit ?? 10);
  return c.json(result, 202);
});
