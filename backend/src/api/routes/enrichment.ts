import { Hono } from "hono";
import { z } from "zod";
import { validateJson } from "../middleware/validate";
import { runEnrichment } from "../../services/enrichment";

const enrichmentRequestSchema = z.object({
  idea_ids: z.array(z.string().uuid()),
});

export const enrichmentRoutes = new Hono();

enrichmentRoutes.post("/run", validateJson(enrichmentRequestSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof enrichmentRequestSchema>;
  const result = await runEnrichment(payload.idea_ids);
  return c.json(result, 202);
});
