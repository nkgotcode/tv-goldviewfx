import { Hono } from "hono";
import { requireOperatorRole, withOpsIdentity } from "../middleware/rbac";
import { validateJson } from "../middleware/validate";
import { trainingRequestSchema } from "../../rl/schemas";
import { runTraining } from "../../services/training_service";
import { recordOpsAudit } from "../../services/ops_audit";

export const agentTrainingRoutes = new Hono();

agentTrainingRoutes.use("*", withOpsIdentity);

agentTrainingRoutes.post("/:agentId/training", requireOperatorRole, validateJson(trainingRequestSchema), async (c) => {
  const payload = c.get("validatedBody") as typeof trainingRequestSchema._type;
  const result = await runTraining({
    pair: payload.pair,
    periodStart: payload.periodStart,
    periodEnd: payload.periodEnd,
    interval: payload.interval ?? null,
    contextIntervals: payload.contextIntervals ?? [],
    datasetVersionId: payload.datasetVersionId ?? null,
    featureSetVersionId: payload.featureSetVersionId ?? null,
    windowSize: payload.windowSize,
    stride: payload.stride,
    timesteps: payload.timesteps,
    seed: payload.seed ?? null,
  });

  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "agent.training.run",
    resource_type: "agent_version",
    resource_id: result.agentVersion?.id ?? null,
    metadata: payload,
  });

  return c.json(result, 201);
});
