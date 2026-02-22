import { Hono } from "hono";
import { z } from "zod";
import { validateJson } from "../middleware/validate";
import { requireOperatorRole } from "../middleware/rbac";
import { listFeatureSets, resolveFeatureSetVersion } from "../../services/feature_set_service";
import { recordOpsAudit } from "../../services/ops_audit";

const featureSetSchema = z.object({
  version: z.enum(["v1", "v2"]).optional(),
  includeNews: z.boolean().optional(),
  includeOcr: z.boolean().optional(),
  technical: z
    .object({
      enabled: z.boolean().optional(),
      criticalFields: z.array(z.string().min(1)).optional(),
      indicators: z
        .array(
          z.object({
            name: z.string().min(1),
            params: z.record(z.number()).optional(),
            outputNames: z.array(z.string().min(1)).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

export const featureSetsRoutes = new Hono();

featureSetsRoutes.get("/", async (c) => {
  const features = await listFeatureSets();
  return c.json(features);
});

featureSetsRoutes.post("/", requireOperatorRole, validateJson(featureSetSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof featureSetSchema>;
  const version = await resolveFeatureSetVersion({
    version: payload.version,
    includeNews: payload.includeNews ?? false,
    includeOcr: payload.includeOcr ?? false,
    technical: payload.technical,
  });
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "feature_set.resolve",
    resource_type: "feature_set_version",
    resource_id: version.id,
    metadata: payload,
  });
  return c.json(version);
});
