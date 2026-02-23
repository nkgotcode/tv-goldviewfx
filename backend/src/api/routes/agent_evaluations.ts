import { Hono } from "hono";
import { requireOperatorRole, withOpsIdentity } from "../middleware/rbac";
import { validateJson } from "../middleware/validate";
import { evaluationRequestSchema } from "../../rl/schemas";
import { listEvaluations, runEvaluation } from "../../services/evaluation_service";
import { recordOpsAudit } from "../../services/ops_audit";

export const agentEvaluationsRoutes = new Hono();

agentEvaluationsRoutes.use("*", withOpsIdentity);

agentEvaluationsRoutes.post("/:agentId/evaluations", requireOperatorRole, validateJson(evaluationRequestSchema), async (c) => {
  const payload = c.get("validatedBody") as typeof evaluationRequestSchema._type;
  try {
    const report = await runEvaluation(payload);
    await recordOpsAudit({
      actor: c.get("opsActor") ?? "system",
      action: "agent.evaluation.run",
      resource_type: "evaluation_report",
      resource_id: report.id,
      metadata: payload,
    });
    return c.json(report, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Evaluation failed";
    if (
      message.includes("Invalid evaluation period") ||
      message.includes("period_end must be after period_start") ||
      message.includes("No trades available") ||
      message.includes("No walk-forward folds available") ||
      message.includes("MAX_PARAMETERS_EXCEEDED") ||
      message.includes("dataset_features are required") ||
      message.includes("No features available for dataset window") ||
      message.includes("No evaluation windows generated")
    ) {
      return c.json({ error: message }, 400);
    }
    return c.json({ error: message }, 500);
  }
});

agentEvaluationsRoutes.get("/:agentId/evaluations", async (c) => {
  const agentVersionId = c.req.query("agentVersionId") ?? undefined;
  const reports = await listEvaluations(agentVersionId);
  return c.json(reports);
});
