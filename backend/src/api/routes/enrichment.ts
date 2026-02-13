import { Hono } from "hono";
import { z } from "zod";
import { requireOperatorRole } from "../middleware/rbac";
import { validateJson } from "../middleware/validate";
import { runEnrichment } from "../../services/enrichment";
import { recordOpsAudit } from "../../services/ops_audit";

const enrichmentRequestSchema = z.object({
  idea_ids: z.array(z.string().uuid()),
});

export const enrichmentRoutes = new Hono();

enrichmentRoutes.post("/run", requireOperatorRole, validateJson(enrichmentRequestSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof enrichmentRequestSchema>;
  const result = await runEnrichment(payload.idea_ids);
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "enrichment.run",
    resource_type: "enrichment",
    metadata: { idea_ids: payload.idea_ids, count: payload.idea_ids.length },
  });
  return c.json(result, 202);
});
