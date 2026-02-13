import { insertEvaluationReport } from "../db/repositories/evaluation_reports";
import { insertLearningUpdate, updateLearningUpdate } from "../db/repositories/learning_updates";
import { promoteAgentVersion, rollbackAgentVersion } from "../services/agent_version_service";
import { recordLearningWindow } from "../services/rl_metrics";

export type LearningUpdateMetrics = {
  winRate: number;
  netPnlAfterFees: number;
  maxDrawdown: number;
  tradeCount: number;
};

export type LearningUpdateInput = {
  agentVersionId: string;
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
  windowStart: string;
  windowEnd: string;
  metrics: LearningUpdateMetrics;
  rollbackVersionId?: string | null;
};

const PROMOTION_RULES = {
  minWinRate: 0.55,
  minNetPnl: 0,
  maxDrawdown: 0.25,
  minTradeCount: 20,
};

function shouldPromote(metrics: LearningUpdateMetrics) {
  if (metrics.winRate < PROMOTION_RULES.minWinRate) return false;
  if (metrics.netPnlAfterFees <= PROMOTION_RULES.minNetPnl) return false;
  if (metrics.maxDrawdown > PROMOTION_RULES.maxDrawdown) return false;
  if (metrics.tradeCount < PROMOTION_RULES.minTradeCount) return false;
  return true;
}

export async function runLearningUpdate(input: LearningUpdateInput) {
  const startedAt = new Date().toISOString();
  const evaluationReport = await insertEvaluationReport({
    agent_version_id: input.agentVersionId,
    pair: input.pair,
    period_start: input.windowStart,
    period_end: input.windowEnd,
    win_rate: input.metrics.winRate,
    net_pnl_after_fees: input.metrics.netPnlAfterFees,
    max_drawdown: input.metrics.maxDrawdown,
    trade_count: input.metrics.tradeCount,
    exposure_by_pair: { [input.pair]: 1 },
    status: shouldPromote(input.metrics) ? "pass" : "fail",
  });

  const update = await insertLearningUpdate({
    agent_version_id: input.agentVersionId,
    window_start: input.windowStart,
    window_end: input.windowEnd,
    status: "running",
    started_at: startedAt,
    evaluation_report_id: evaluationReport.id,
  });

  const promoted = shouldPromote(input.metrics);
  if (promoted) {
    await promoteAgentVersion(input.agentVersionId);
  } else if (input.rollbackVersionId) {
    await rollbackAgentVersion(input.rollbackVersionId);
  }

  const status = promoted ? "succeeded" : "failed";
  const updated = await updateLearningUpdate(update.id, {
    status,
    completed_at: new Date().toISOString(),
  });

  recordLearningWindow({
    agentVersionId: input.agentVersionId,
    pair: input.pair,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    status,
  });

  return updated;
}

export async function runLearningUpdateFromReport(input: {
  report: {
    id: string;
    agent_version_id?: string;
    agentVersionId?: string;
    pair: string;
    period_start?: string;
    periodStart?: string;
    period_end?: string;
    periodEnd?: string;
    win_rate?: number;
    winRate?: number;
    net_pnl_after_fees?: number;
    netPnlAfterFees?: number;
    max_drawdown?: number;
    maxDrawdown?: number;
    trade_count?: number;
    tradeCount?: number;
    status?: "pass" | "fail";
  };
  rollbackVersionId?: string | null;
}) {
  const report = input.report;
  const startedAt = new Date().toISOString();
  const agentVersionId = (report.agent_version_id ?? report.agentVersionId) as string | undefined;
  if (!agentVersionId) {
    throw new Error("Learning update requires agent version id");
  }
  const windowStart = (report.period_start ?? report.periodStart) as string | undefined;
  const windowEnd = (report.period_end ?? report.periodEnd) as string | undefined;
  if (!windowStart || !windowEnd) {
    throw new Error("Learning update requires evaluation window boundaries");
  }

  const update = await insertLearningUpdate({
    agent_version_id: agentVersionId,
    window_start: windowStart,
    window_end: windowEnd,
    status: "running",
    started_at: startedAt,
    evaluation_report_id: report.id,
  });

  const promoted = report.status === "pass";
  if (promoted) {
    await promoteAgentVersion(agentVersionId);
  } else if (input.rollbackVersionId && input.rollbackVersionId !== agentVersionId) {
    await rollbackAgentVersion(input.rollbackVersionId);
  }

  const status = promoted ? "succeeded" : "failed";
  const updated = await updateLearningUpdate(update.id, {
    status,
    completed_at: new Date().toISOString(),
  });

  recordLearningWindow({
    agentVersionId,
    pair: report.pair,
    windowStart,
    windowEnd,
    status,
  });

  return updated;
}
