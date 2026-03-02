import { Hono } from "hono";
import { z } from "zod";
import { validateJson } from "../middleware/validate";
import { listSourcePolicies, upsertSourcePolicy } from "../../db/repositories/source_policies";
import { requireOperatorRole } from "../middleware/rbac";
import { logWarn } from "../../services/logger";
import { recordOpsAudit } from "../../services/ops_audit";

const policySchema = z.object({
  source_id: z.string().uuid().nullable().optional(),
  source_type: z.string(),
  enabled: z.boolean().optional(),
  min_confidence_score: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

export const sourcePoliciesRoutes = new Hono();

const OPS_READ_TIMEOUT_MS = (() => {
  const parsed = Number.parseInt(process.env.OPS_READ_TIMEOUT_MS ?? "4000", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 4000;
  return parsed;
})();

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_timeout_${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

sourcePoliciesRoutes.get("/", async (c) => {
  try {
    const policies = await withTimeout(listSourcePolicies(), OPS_READ_TIMEOUT_MS, "source_policies_read");
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
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "source_policy.upsert",
    resource_type: "source_policy",
    resource_id: policy.id ?? null,
    metadata: payload,
  });
  return c.json(policy);
});
