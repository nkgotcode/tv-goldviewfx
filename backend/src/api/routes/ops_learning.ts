import { Hono } from "hono";
import { loadEnv } from "../../config/env";
import { loadRlServiceConfig } from "../../config/rl_service";
import { getEvaluationReport, getLatestEvaluationReport } from "../../db/repositories/evaluation_reports";
import { listRecentLearningUpdates } from "../../db/repositories/learning_updates";
import { runOnlineLearningCycle } from "../../services/online_learning_service";
import { recordOpsAudit } from "../../services/ops_audit";
import { logWarn } from "../../services/logger";
import { requireOperatorRole, withOpsIdentity } from "../middleware/rbac";

export const opsLearningRoutes = new Hono();

opsLearningRoutes.use("*", withOpsIdentity);

function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatEvaluation(report: any) {
  if (!report) return null;
  return {
    id: report.id,
    agentVersionId: report.agent_version_id,
    pair: report.pair,
    periodStart: report.period_start,
    periodEnd: report.period_end,
    winRate: toNumber(report.win_rate),
    netPnlAfterFees: toNumber(report.net_pnl_after_fees),
    maxDrawdown: toNumber(report.max_drawdown),
    tradeCount: toNumber(report.trade_count),
    backtestRunId: report.backtest_run_id ?? null,
    status: report.status,
    createdAt: report.created_at ?? null,
  };
}

opsLearningRoutes.get("/status", async (c) => {
  const env = loadEnv();
  const rlConfig = loadRlServiceConfig();
  const limit = Number.parseInt(c.req.query("limit") ?? "5", 10);
  const pair = (c.req.query("pair") ?? env.RL_ONLINE_LEARNING_PAIR) as string;

  try {
    const updates = await listRecentLearningUpdates(Number.isFinite(limit) ? limit : 5);
    const enriched = await Promise.all(
      updates.map(async (update) => {
        let report = null;
        if (update.evaluation_report_id) {
          try {
            report = await getEvaluationReport(update.evaluation_report_id);
          } catch {
            report = null;
          }
        }
        return {
          id: update.id,
          agentVersionId: update.agent_version_id,
          windowStart: update.window_start,
          windowEnd: update.window_end,
          status: update.status,
          startedAt: update.started_at ?? null,
          completedAt: update.completed_at ?? null,
          evaluationReportId: update.evaluation_report_id ?? null,
          evaluationReport: formatEvaluation(report),
        };
      }),
    );

    const latestReport = await getLatestEvaluationReport({ pair });

    return c.json({
      generatedAt: new Date().toISOString(),
      config: {
        enabled: env.RL_ONLINE_LEARNING_ENABLED,
        intervalMin: env.RL_ONLINE_LEARNING_INTERVAL_MIN,
        pair: env.RL_ONLINE_LEARNING_PAIR,
        trainWindowMin: env.RL_ONLINE_LEARNING_TRAIN_WINDOW_MIN,
        evalWindowMin: env.RL_ONLINE_LEARNING_EVAL_WINDOW_MIN,
        evalLagMin: env.RL_ONLINE_LEARNING_EVAL_LAG_MIN,
        windowSize: env.RL_ONLINE_LEARNING_WINDOW_SIZE,
        stride: env.RL_ONLINE_LEARNING_STRIDE,
        timesteps: env.RL_ONLINE_LEARNING_TIMESTEPS,
        decisionThreshold: env.RL_ONLINE_LEARNING_DECISION_THRESHOLD,
        autoRollForward: env.RL_ONLINE_LEARNING_AUTO_ROLL_FORWARD,
      },
      rlService: {
        url: rlConfig.url,
        mock: rlConfig.mock,
      },
      latestUpdates: enriched,
      latestReport: formatEvaluation(latestReport),
    });
  } catch (error) {
    logWarn("Failed to load online learning status", { error: String(error) });
    return c.json({
      generatedAt: new Date().toISOString(),
      config: {
        enabled: env.RL_ONLINE_LEARNING_ENABLED,
        intervalMin: env.RL_ONLINE_LEARNING_INTERVAL_MIN,
        pair: env.RL_ONLINE_LEARNING_PAIR,
        trainWindowMin: env.RL_ONLINE_LEARNING_TRAIN_WINDOW_MIN,
        evalWindowMin: env.RL_ONLINE_LEARNING_EVAL_WINDOW_MIN,
        evalLagMin: env.RL_ONLINE_LEARNING_EVAL_LAG_MIN,
        windowSize: env.RL_ONLINE_LEARNING_WINDOW_SIZE,
        stride: env.RL_ONLINE_LEARNING_STRIDE,
        timesteps: env.RL_ONLINE_LEARNING_TIMESTEPS,
        decisionThreshold: env.RL_ONLINE_LEARNING_DECISION_THRESHOLD,
        autoRollForward: env.RL_ONLINE_LEARNING_AUTO_ROLL_FORWARD,
      },
      rlService: {
        url: rlConfig.url,
        mock: rlConfig.mock,
      },
      latestUpdates: [],
      latestReport: null,
    });
  }
});

opsLearningRoutes.post("/run", requireOperatorRole, async (c) => {
  try {
    const result = await runOnlineLearningCycle("manual");
    await recordOpsAudit({
      actor: c.get("opsActor") ?? "system",
      action: "online_learning.run",
      resource_type: "learning_update",
      metadata: result,
    });
    return c.json({ ...result, ranAt: new Date().toISOString() });
  } catch (error) {
    logWarn("Failed to run online learning", { error: String(error) });
    return c.json({ error: "online_learning_failed" }, 500);
  }
});
