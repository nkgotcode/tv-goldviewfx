import { Hono } from "hono";
import { z } from "zod";
import { validateJson } from "../middleware/validate";
import { requireOperatorRole } from "../middleware/rbac";
import { listFeatureSets, resolveFeatureSetVersion } from "../../services/feature_set_service";

const featureSetSchema = z.object({
  includeNews: z.boolean().optional(),
  includeOcr: z.boolean().optional(),
});

export const featureSetsRoutes = new Hono();

featureSetsRoutes.get("/", async (c) => {
  const features = await listFeatureSets();
  return c.json(features);
});

featureSetsRoutes.post("/", requireOperatorRole, validateJson(featureSetSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof featureSetSchema>;
  const version = await resolveFeatureSetVersion({
    includeNews: payload.includeNews ?? false,
    includeOcr: payload.includeOcr ?? false,
  });
  return c.json(version);
});
