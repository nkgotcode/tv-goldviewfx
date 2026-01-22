import { Hono } from "hono";
import { z } from "zod";
import { validateJson } from "../middleware/validate";
import { listSourcePolicies, upsertSourcePolicy } from "../../db/repositories/source_policies";
import { requireOperatorRole } from "../middleware/rbac";
import { logWarn } from "../../services/logger";

const policySchema = z.object({
  source_id: z.string().uuid().nullable().optional(),
  source_type: z.string(),
  enabled: z.boolean().optional(),
  min_confidence_score: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

export const sourcePoliciesRoutes = new Hono();

sourcePoliciesRoutes.get("/", async (c) => {
  try {
    const policies = await listSourcePolicies();
    return c.json({ data: policies });
  } catch (error) {
    logWarn("Failed to load source policies", { error: String(error) });
    return c.json({ data: [] });
  }
});

sourcePoliciesRoutes.put("/", requireOperatorRole, validateJson(policySchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof policySchema>;
  const policy = await upsertSourcePolicy({
    source_id: payload.source_id ?? null,
    source_type: payload.source_type,
    enabled: payload.enabled,
    min_confidence_score: payload.min_confidence_score ?? null,
    notes: payload.notes ?? null,
  });
  return c.json(policy);
});
