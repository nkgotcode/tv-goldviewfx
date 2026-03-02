import { Hono, type Context } from "hono";
import { z } from "zod";
import { requireOperatorRole, withOpsIdentity } from "../middleware/rbac";
import { validateJson } from "../middleware/validate";
import { evaluationRequestSchema } from "../../rl/schemas";
import { listEvaluations, runEvaluation, isDataGapBlockedError } from "../../services/evaluation_service";
import { recordOpsAudit } from "../../services/ops_audit";
import { logWarn } from "../../services/logger";
import { createHash } from "node:crypto";
import { enqueueRetry } from "../../services/retry_queue_service";
import {
  runEvaluationConfirmHeal,
  shouldQueueConfirmHeal,
} from "../../services/evaluation_confirm_heal_service";

export const agentEvaluationsRoutes = new Hono();

const evaluationConfirmHealSchema = z.object({
  evaluation: evaluationRequestSchema,
  heal: z.object({
    confirm: z.literal(true),
    allPairs: z.boolean().optional(),
    allIntervals: z.boolean().optional(),
    intervals: z.array(z.string().min(1)).optional(),
    maxBatches: z.number().int().positive().optional(),
    runGapMonitor: z.boolean().optional(),
  }),
});

function mapEvaluationError(c: Context, agentId: string, error: unknown) {
  if (isDataGapBlockedError(error)) {
    const context = error.context;
    return c.json(
      {
        error: error.message,
        code: error.code,
        blocking: true,
        pair: context.pair,
        interval: context.interval,
        blocking_reasons: context.blockingReasons,
        warnings: context.warnings,
        integrity_provenance: context.integrityProvenance,
        gap_health: context.gapHealth,
        confirm_heal_endpoint: `/agents/${agentId}/evaluations/confirm-heal`,
      },
      409,
    );
  }

  const message = error instanceof Error ? error.message : "Evaluation failed";
  if (
    message.includes("Invalid evaluation period") ||
    message.includes("period_end must be after period_start") ||
    message.includes("No trades available") ||
    message.includes("MAX_PARAMETERS_EXCEEDED") ||
    message.includes("dataset_features are required") ||
    message.includes("No features available for dataset window") ||
    message.includes("No evaluation windows generated") ||
    message.includes("Nautilus backtest did not return a usable PnL metric")
  ) {
    return c.json({ error: message }, 400);
  }
  return c.json({ error: message }, 500);
}

agentEvaluationsRoutes.use("*", withOpsIdentity);

agentEvaluationsRoutes.post("/:agentId/evaluations", requireOperatorRole, validateJson(evaluationRequestSchema), async (c) => {
  const payload = c.get("validatedBody") as typeof evaluationRequestSchema._type;
  const agentId = c.req.param("agentId");
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
    return mapEvaluationError(c, agentId, error);
  }
});

agentEvaluationsRoutes.post(
  "/:agentId/evaluations/confirm-heal",
  requireOperatorRole,
  validateJson(evaluationConfirmHealSchema),
  async (c) => {
    const payload = c.get("validatedBody") as z.infer<typeof evaluationConfirmHealSchema>;
    const agentId = c.req.param("agentId");
    const evaluation = payload.evaluation;
    const actor = c.get("opsActor") ?? "system";
    const confirmHealPayload = {
      agentId,
      actor,
      evaluation,
      heal: {
        allPairs: payload.heal.allPairs,
        allIntervals: payload.heal.allIntervals,
        intervals: payload.heal.intervals,
        maxBatches: payload.heal.maxBatches,
        runGapMonitor: payload.heal.runGapMonitor,
      },
    };

    try {
      if (shouldQueueConfirmHeal(confirmHealPayload)) {
        const dedupeKey = createHash("sha256")
          .update(
            JSON.stringify({
              pair: evaluation.pair,
              periodStart: evaluation.periodStart,
              periodEnd: evaluation.periodEnd,
              interval: evaluation.interval ?? null,
              contextIntervals: evaluation.contextIntervals ?? [],
              walkForward: evaluation.walkForward ?? null,
              strategyIds: evaluation.strategyIds ?? [],
              venueIds: evaluation.venueIds ?? [],
              backtestMode: evaluation.backtestMode ?? null,
              allPairs: payload.heal.allPairs ?? null,
              allIntervals: payload.heal.allIntervals ?? null,
              intervals: payload.heal.intervals ?? [],
              maxBatches: payload.heal.maxBatches ?? null,
              runGapMonitor: payload.heal.runGapMonitor ?? null,
            }),
          )
          .digest("hex");
        const queued = await enqueueRetry({
          jobType: "evaluation_confirm_heal",
          payload: confirmHealPayload as Record<string, unknown>,
          dedupeKey,
          maxAttempts: 2,
        });

        logWarn("Confirm-heal request offloaded to retry queue", {
          pair: evaluation.pair,
          queueId: queued.id,
          agentId,
        });

        return c.json(
          {
            queued: true,
            operation_id: queued.id,
            operation_status: queued.status,
            message:
              "Confirm-heal accepted and offloaded for asynchronous execution due to expected runtime.",
          },
          202,
        );
      }

      const result = await runEvaluationConfirmHeal(confirmHealPayload);
      return c.json(result, 202);
    } catch (error) {
      return mapEvaluationError(c, agentId, error);
    }
  },
);

agentEvaluationsRoutes.get("/:agentId/evaluations", async (c) => {
  const agentVersionId = c.req.query("agentVersionId") ?? undefined;
  const limitQuery = c.req.query("limit");
  const parsedLimit = limitQuery === undefined ? undefined : Number.parseInt(limitQuery, 10);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;
  const offsetQuery = c.req.query("offset");
  const parsedOffset = offsetQuery === undefined ? undefined : Number.parseInt(offsetQuery, 10);
  const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : undefined;
  try {
    const reports = await listEvaluations(agentVersionId, limit, offset);
    return c.json(reports);
  } catch (error) {
    logWarn("Failed to list evaluation reports", {
      error: String(error),
      agentId: c.req.param("agentId"),
      agentVersionId: agentVersionId ?? null,
    });
    return c.json([]);
  }
});
