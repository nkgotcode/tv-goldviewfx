import { Hono } from "hono";
import { z } from "zod";
import { validateJson } from "../middleware/validate";
import { riskLimitSetSchema } from "../../rl/schemas";
import { createRiskLimitSet, listRiskLimits, updateRiskLimitSetRecord } from "../../services/risk_limits_service";

export const riskLimitsRoutes = new Hono();

riskLimitsRoutes.get("/", async (c) => {
  const activeOnly = c.req.query("active") === "true";
  const limits = await listRiskLimits(activeOnly);
  return c.json(limits);
});

riskLimitsRoutes.post("/", validateJson(riskLimitSetSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof riskLimitSetSchema>;
  const created = await createRiskLimitSet(payload);
  return c.json(created, 201);
});

riskLimitsRoutes.patch("/:riskLimitId", validateJson(riskLimitSetSchema.partial()), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof riskLimitSetSchema>;
  const updated = await updateRiskLimitSetRecord(c.req.param("riskLimitId"), payload);
  return c.json(updated);
});
