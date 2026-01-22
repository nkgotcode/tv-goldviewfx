import { Hono } from "hono";
import { validateJson } from "../middleware/validate";
import { evaluationRequestSchema } from "../../rl/schemas";
import { listEvaluations, runEvaluation } from "../../services/evaluation_service";

export const agentEvaluationsRoutes = new Hono();

agentEvaluationsRoutes.post("/:agentId/evaluations", validateJson(evaluationRequestSchema), async (c) => {
  const payload = c.get("validatedBody") as typeof evaluationRequestSchema._type;
  try {
    const report = await runEvaluation(payload);
    return c.json(report, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Evaluation failed";
    if (message.includes("Invalid evaluation period") || message.includes("No trades available")) {
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
