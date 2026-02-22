import { Hono } from "hono";
import { z } from "zod";
import { validateJson } from "../middleware/validate";
import { requireOperatorRole, withOpsIdentity } from "../middleware/rbac";
import { getAgentConfig, updateAgentConfig } from "../../db/repositories/agent_config";
import { disableTradingAgent, enableTradingAgent } from "../../agents/trading_agent";
import { agentConfigPatchSchema, agentStartRequestSchema, tradingPairSchema } from "../../rl/schemas";
import {
  startAgentRun,
  pauseAgentRun,
  resumeAgentRun,
  stopAgentRun,
  listRuns,
  getAgentStatus,
  updateRunConfig,
} from "../../services/rl_agent_service";
import { runDecisionPipeline } from "../../services/rl_decision_pipeline";
import { runLearningUpdate } from "../../jobs/learning_updates";
import { recordOpsAudit } from "../../services/ops_audit";
import { logWarn } from "../../services/logger";

const agentConfigSchema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(["paper", "live"]).optional(),
  max_position_size: z.number().positive().optional(),
  daily_loss_limit: z.number().nonnegative().optional(),
  allowed_instruments: z.array(z.string()).optional(),
  kill_switch: z.boolean().optional(),
  kill_switch_reason: z.string().optional(),
  min_confidence_score: z.number().nonnegative().optional(),
  allowed_source_ids: z.array(z.string().uuid()).optional(),
  promotion_required: z.boolean().optional(),
  promotion_min_trades: z.number().int().nonnegative().optional(),
  promotion_min_win_rate: z.number().nonnegative().optional(),
  promotion_min_net_pnl: z.number().optional(),
  promotion_max_drawdown: z.number().nonnegative().optional(),
});

export const agentRoutes = new Hono();
export const rlAgentRoutes = new Hono();

agentRoutes.use("*", withOpsIdentity);
rlAgentRoutes.use("*", withOpsIdentity);

agentRoutes.get("/config", async (c) => {
  try {
    const config = await getAgentConfig();
    return c.json(config);
  } catch (error) {
    logWarn("Failed to load agent configuration", { error: String(error) });
    return c.json({
      id: "local-fallback",
      enabled: false,
      mode: "paper",
      max_position_size: 1,
      daily_loss_limit: 0,
      allowed_instruments: ["GOLD-USDT"],
      kill_switch: false,
      kill_switch_reason: null,
      min_confidence_score: 0,
      allowed_source_ids: [],
      promotion_required: false,
      promotion_min_trades: 0,
      promotion_min_win_rate: 0,
      promotion_min_net_pnl: 0,
      promotion_max_drawdown: 0,
    });
  }
});

agentRoutes.put("/config", requireOperatorRole, validateJson(agentConfigSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof agentConfigSchema>;
  const config = await updateAgentConfig(payload);
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "agent.config.update",
    resource_type: "agent_config",
    resource_id: config.id,
    metadata: payload,
  });
  return c.json(config);
});

agentRoutes.post("/enable", requireOperatorRole, async (c) => {
  const result = await enableTradingAgent();
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "agent.enable",
    resource_type: "agent",
    resource_id: result.config?.id ?? null,
  });
  return c.json(result);
});

agentRoutes.post("/disable", requireOperatorRole, async (c) => {
  const result = await disableTradingAgent();
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "agent.disable",
    resource_type: "agent",
    resource_id: result.config?.id ?? null,
  });
  return c.json(result);
});

const decisionRequestSchema = z.object({
  market: z.object({
    candles: z.array(
      z.object({
        timestamp: z.string(),
        open: z.number(),
        high: z.number(),
        low: z.number(),
        close: z.number(),
        volume: z.number(),
      }),
    ),
    lastPrice: z.number().optional(),
    spread: z.number().optional(),
  }),
  ideas: z
    .array(z.object({ source: z.string(), timestamp: z.string(), score: z.number(), confidence: z.number().optional() }))
    .optional(),
  signals: z
    .array(z.object({ source: z.string(), timestamp: z.string(), score: z.number(), confidence: z.number().optional() }))
    .optional(),
  news: z
    .array(z.object({ source: z.string(), timestamp: z.string(), score: z.number(), confidence: z.number().optional() }))
    .optional(),
  ocr: z
    .array(
      z.object({
        source: z.string(),
        timestamp: z.string(),
        score: z.number(),
        confidence: z.number().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
  recentTrades: z
    .array(
      z.object({
        executedAt: z.string(),
        side: z.enum(["long", "short", "close"]),
        quantity: z.number(),
        price: z.number(),
      }),
    )
    .optional(),
  simulateExecutionStatus: z.enum(["partial", "filled", "failed"]).optional(),
});

const learningUpdateSchema = z.object({
  agentVersionId: z.string().uuid(),
  pair: tradingPairSchema,
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  metrics: z.object({
    winRate: z.number(),
    netPnlAfterFees: z.number(),
    maxDrawdown: z.number(),
    tradeCount: z.number().int(),
  }),
  rollbackVersionId: z.string().uuid().optional(),
});

rlAgentRoutes.get("/", async (c) => {
  const status = await getAgentStatus();
  return c.json([
    {
      id: "gold-rl-agent",
      name: "Gold RL Agent",
      status: status.currentRun?.status ?? "stopped",
    },
  ]);
});

rlAgentRoutes.get("/:agentId", async (c) => {
  const status = await getAgentStatus();
  return c.json({
    id: c.req.param("agentId"),
    currentRun: status.currentRun,
    activeVersion: status.activeVersion,
    learningEnabled: status.currentRun?.learning_enabled ?? false,
    killSwitchEnabled: status.killSwitchEnabled ?? false,
    promotionGateStatus: status.promotionGateStatus ?? "unknown",
  });
});

rlAgentRoutes.post("/:agentId/start", requireOperatorRole, validateJson(agentStartRequestSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof agentStartRequestSchema>;
  const run = await startAgentRun({
    mode: payload.mode,
    pair: payload.pair,
    riskLimitSetId: payload.riskLimitSetId,
    learningEnabled: payload.learningEnabled,
    learningWindowMinutes: payload.learningWindowMinutes,
    datasetVersionId: payload.datasetVersionId,
    featureSetVersionId: payload.featureSetVersionId,
  });
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "rl_agent.start",
    resource_type: "agent_run",
    resource_id: run.id,
    metadata: payload,
  });
  return c.json(run);
});

rlAgentRoutes.post("/:agentId/pause", requireOperatorRole, async (c) => {
  const status = await getAgentStatus();
  if (!status.currentRun) {
    return c.json({ error: "No active run" }, 404);
  }
  if (status.currentRun.status === "paused") {
    return c.json(status.currentRun);
  }
  if (status.currentRun.status !== "running") {
    return c.json({ error: "No active run" }, 404);
  }
  const run = await pauseAgentRun(status.currentRun.id);
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "rl_agent.pause",
    resource_type: "agent_run",
    resource_id: run.id,
  });
  return c.json(run);
});

rlAgentRoutes.post("/:agentId/resume", requireOperatorRole, async (c) => {
  const status = await getAgentStatus();
  if (!status.currentRun) {
    return c.json({ error: "No paused run" }, 404);
  }
  if (status.currentRun.status === "running") {
    return c.json(status.currentRun);
  }
  if (status.currentRun.status !== "paused") {
    return c.json({ error: "No paused run" }, 404);
  }
  const run = await resumeAgentRun(status.currentRun.id);
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "rl_agent.resume",
    resource_type: "agent_run",
    resource_id: run.id,
  });
  return c.json(run);
});

rlAgentRoutes.post("/:agentId/stop", requireOperatorRole, async (c) => {
  const status = await getAgentStatus();
  if (!status.currentRun) {
    return c.json({ error: "No active run" }, 404);
  }
  const run = await stopAgentRun(status.currentRun.id);
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "rl_agent.stop",
    resource_type: "agent_run",
    resource_id: run.id,
  });
  return c.json(run);
});

rlAgentRoutes.patch("/:agentId/config", requireOperatorRole, validateJson(agentConfigPatchSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof agentConfigPatchSchema>;
  const status = await getAgentStatus();
  if (!status.currentRun) {
    return c.json({ error: "No active run" }, 404);
  }
  const updated = await updateRunConfig(status.currentRun.id, {
    learningEnabled: payload.learningEnabled,
    learningWindowMinutes: payload.learningWindowMinutes,
    riskLimitSetId: payload.riskLimitSetId,
  });
  await recordOpsAudit({
    actor: c.get("opsActor") ?? "system",
    action: "rl_agent.config.update",
    resource_type: "agent_run",
    resource_id: updated.id,
    metadata: payload,
  });
  return c.json(updated);
});

rlAgentRoutes.get("/:agentId/runs", async (c) => {
  const runs = await listRuns();
  return c.json(runs);
});

rlAgentRoutes.post(
  "/:agentId/runs/:runId/decisions",
  requireOperatorRole,
  validateJson(decisionRequestSchema),
  async (c) => {
    const payload = c.get("validatedBody") as z.infer<typeof decisionRequestSchema>;
    const result = await runDecisionPipeline({
      runId: c.req.param("runId"),
      market: {
        candles: payload.market.candles,
        lastPrice: payload.market.lastPrice,
        spread: payload.market.spread,
      },
      ideas: payload.ideas,
      signals: payload.signals,
      news: payload.news,
      recentTrades: payload.recentTrades,
      simulateExecutionStatus: payload.simulateExecutionStatus,
    });
    await recordOpsAudit({
      actor: c.get("opsActor") ?? "system",
      action: "rl_agent.decision",
      resource_type: "agent_run",
      resource_id: c.req.param("runId"),
    });
    return c.json(result);
  },
);

rlAgentRoutes.post(
  "/:agentId/learning-updates",
  requireOperatorRole,
  validateJson(learningUpdateSchema),
  async (c) => {
    const payload = c.get("validatedBody") as z.infer<typeof learningUpdateSchema>;
    const update = await runLearningUpdate({
      agentVersionId: payload.agentVersionId,
      pair: payload.pair,
      windowStart: payload.windowStart,
      windowEnd: payload.windowEnd,
      metrics: payload.metrics,
      rollbackVersionId: payload.rollbackVersionId,
    });
    await recordOpsAudit({
      actor: c.get("opsActor") ?? "system",
      action: "rl_agent.learning_update",
      resource_type: "agent_version",
      resource_id: payload.agentVersionId,
      metadata: payload,
    });
    return c.json(update);
  },
);
