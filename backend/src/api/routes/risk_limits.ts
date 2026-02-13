import { Hono } from "hono";
import { z } from "zod";
import { requireOperatorRole, withOpsIdentity } from "../middleware/rbac";
import { validateJson } from "../middleware/validate";
import { riskLimitSetSchema } from "../../rl/schemas";
import { createRiskLimitSet, listRiskLimits, updateRiskLimitSetRecord } from "../../services/risk_limits_service";
import { recordOpsAudit } from "../../services/ops_audit";

export const riskLimitsRoutes = new Hono();

riskLimitsRoutes.use("*", withOpsIdentity);

riskLimitsRoutes.get("/", async (c) => {
  const activeOnly = c.req.query("active") === "true";
  const limits = await listRiskLimits(activeOnly);
  return c.json(limits);
});

riskLimitsRoutes.post("/", requireOperatorRole, validateJson(riskLimitSetSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof riskLimitSetSchema>;
  const created = await createRiskLimitSet(payload);
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "risk_limits.create",
    resource_type: "risk_limit_set",
    resource_id: created.id,
    metadata: payload,
  });
  return c.json(created, 201);
});

riskLimitsRoutes.patch("/:riskLimitId", requireOperatorRole, validateJson(riskLimitSetSchema.partial()), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof riskLimitSetSchema>;
  const id = c.req.param("riskLimitId");
  const updated = await updateRiskLimitSetRecord(id, payload);
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "risk_limits.update",
    resource_type: "risk_limit_set",
    resource_id: id,
    metadata: payload,
  });
  return c.json(updated);
});
