import { Hono, type Context } from "hono";
import { z } from "zod";
import { requireOperatorRole, withOpsIdentity } from "../middleware/rbac";
import { validateJson } from "../middleware/validate";
import { evaluationRequestSchema } from "../../rl/schemas";
import { listEvaluations, runEvaluation, isDataGapBlockedError } from "../../services/evaluation_service";
import { recordOpsAudit } from "../../services/ops_audit";
import { runBingxMarketDataIngest } from "../../services/bingx_market_data_ingest";
import { runDataGapMonitor } from "../../services/data_gap_service";

export const agentEvaluationsRoutes = new Hono();

const evaluationConfirmHealSchema = z.object({
  evaluation: evaluationRequestSchema,
  heal: z.object({
    confirm: z.literal(true),
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
    const intervals = payload.heal.intervals?.length ? payload.heal.intervals : [evaluation.interval ?? "1m"];
    const runGapMonitor = payload.heal.runGapMonitor ?? true;

    try {
      await runBingxMarketDataIngest({
        pairs: [evaluation.pair],
        intervals,
        maxBatches: payload.heal.maxBatches,
        backfill: true,
        trigger: "manual",
      });

      if (runGapMonitor) {
        await runDataGapMonitor();
      }

      const report = await runEvaluation(evaluation, {
        bypassDataGapGate: true,
        gapGateBypassReason: "manual_confirm_heal_and_continue",
      });

      await recordOpsAudit({
        actor: c.get("opsActor") ?? "system",
        action: "agent.evaluation.confirm_heal_and_run",
        resource_type: "evaluation_report",
        resource_id: report.id,
        metadata: {
          evaluation,
          heal: {
            intervals,
            maxBatches: payload.heal.maxBatches ?? null,
            runGapMonitor,
          },
        },
      });

      return c.json(
        {
          report,
          heal: {
            status: "applied",
            pair: evaluation.pair,
            intervals,
            max_batches: payload.heal.maxBatches ?? null,
            gap_monitor_ran: runGapMonitor,
          },
        },
        202,
      );
    } catch (error) {
      return mapEvaluationError(c, agentId, error);
    }
  },
);

agentEvaluationsRoutes.get("/:agentId/evaluations", async (c) => {
  const agentVersionId = c.req.query("agentVersionId") ?? undefined;
  const reports = await listEvaluations(agentVersionId);
  return c.json(reports);
});
