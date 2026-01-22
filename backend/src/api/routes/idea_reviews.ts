import { Hono } from "hono";
import { z } from "zod";
import { validateJson } from "../middleware/validate";
import { supabase } from "../../db/client";
import { setIdeaReviewStatus } from "../../services/idea_review_service";
import { requireOperatorRole, withOpsIdentity } from "../middleware/rbac";
import { recordOpsAudit } from "../../services/ops_audit";

const reviewSchema = z.object({
  review_status: z.enum(["new", "triaged", "approved", "rejected"]),
  reviewed_by: z.string().optional(),
});

export const ideaReviewRoutes = new Hono();

ideaReviewRoutes.use("*", withOpsIdentity);

ideaReviewRoutes.get("/:ideaId", async (c) => {
  const ideaId = c.req.param("ideaId");
  const result = await supabase
    .from("ideas")
    .select("id, review_status, reviewed_at, reviewed_by")
    .eq("id", ideaId)
    .maybeSingle();
  return c.json(result.data ?? null);
});

ideaReviewRoutes.put("/:ideaId", requireOperatorRole, validateJson(reviewSchema), async (c) => {
  const ideaId = c.req.param("ideaId");
  const payload = c.get("validatedBody") as z.infer<typeof reviewSchema>;
  const updated = await setIdeaReviewStatus({
    ideaId,
    reviewStatus: payload.review_status,
    reviewer: payload.reviewed_by ?? (c.get("opsActor") as string | undefined),
  });
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "idea.review.update",
    resource_type: "idea",
    resource_id: ideaId,
    metadata: payload,
  });
  return c.json(updated);
});
