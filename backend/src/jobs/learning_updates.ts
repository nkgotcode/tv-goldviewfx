import { insertEvaluationReport } from "../db/repositories/evaluation_reports";
import { insertLearningUpdate, updateLearningUpdate } from "../db/repositories/learning_updates";
import { loadEnv } from "../config/env";
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
  pair: string;
  windowStart: string;
  windowEnd: string;
  metrics: LearningUpdateMetrics;
  championMetrics?: LearningUpdateMetrics | null;
  championEvaluationReportId?: string | null;
  rollbackVersionId?: string | null;
};

const PROMOTION_RULES = {
  minWinRate: 0.55,
  minNetPnl: 0,
  maxDrawdown: 0.25,
  minTradeCount: 20,
};

type PromotionDecision = {
  promoted: boolean;
  reasons: string[];
  deltas: Record<string, number>;
};

function evaluatePromotionDecision(params: {
  challenger: LearningUpdateMetrics;
  challengerStatus?: "pass" | "fail";
  champion?: LearningUpdateMetrics | null;
}): PromotionDecision {
  const env = loadEnv();
  const challenger = params.challenger;
  const champion = params.champion ?? null;
  const reasons: string[] = [];
  const deltas = {
    winRateDelta: champion ? challenger.winRate - champion.winRate : challenger.winRate,
    netPnlDelta: champion ? challenger.netPnlAfterFees - champion.netPnlAfterFees : challenger.netPnlAfterFees,
    drawdownDelta: champion ? challenger.maxDrawdown - champion.maxDrawdown : challenger.maxDrawdown,
    tradeCountDelta: champion ? challenger.tradeCount - champion.tradeCount : challenger.tradeCount,
  };

  if (params.challengerStatus === "fail") reasons.push("challenger_report_failed");
  if (challenger.winRate < PROMOTION_RULES.minWinRate) reasons.push("win_rate_below_threshold");
  if (challenger.netPnlAfterFees <= PROMOTION_RULES.minNetPnl) reasons.push("net_pnl_non_positive");
  if (challenger.maxDrawdown > PROMOTION_RULES.maxDrawdown) reasons.push("drawdown_too_high");
  if (challenger.tradeCount < PROMOTION_RULES.minTradeCount) reasons.push("insufficient_trade_count");

  if (champion) {
    if (deltas.winRateDelta < env.RL_ONLINE_LEARNING_MIN_WIN_RATE_DELTA) reasons.push("win_rate_delta_below_gate");
    if (deltas.netPnlDelta < env.RL_ONLINE_LEARNING_MIN_NET_PNL_DELTA) reasons.push("net_pnl_delta_below_gate");
    if (deltas.drawdownDelta > env.RL_ONLINE_LEARNING_MAX_DRAWDOWN_DELTA) reasons.push("drawdown_delta_above_gate");
    if (deltas.tradeCountDelta < env.RL_ONLINE_LEARNING_MIN_TRADE_COUNT_DELTA) reasons.push("trade_count_delta_below_gate");
  }

  return {
    promoted: reasons.length === 0,
    reasons,
    deltas,
  };
}

export async function runLearningUpdate(input: LearningUpdateInput) {
  const startedAt = new Date().toISOString();
  const baselineDecision = evaluatePromotionDecision({
    challenger: input.metrics,
    challengerStatus: "pass",
    champion: null,
  });
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
    status: baselineDecision.promoted ? "pass" : "fail",
  });

  const update = await insertLearningUpdate({
    agent_version_id: input.agentVersionId,
    window_start: input.windowStart,
    window_end: input.windowEnd,
    status: "running",
    started_at: startedAt,
    evaluation_report_id: evaluationReport.id,
  });

  const decision = evaluatePromotionDecision({
    challenger: input.metrics,
    challengerStatus: "pass",
    champion: input.championMetrics ?? null,
  });
  if (decision.promoted) {
    await promoteAgentVersion(input.agentVersionId);
  } else if (input.rollbackVersionId) {
    await rollbackAgentVersion(input.rollbackVersionId);
  }

  const status = decision.promoted ? "succeeded" : "failed";
  const updated = await updateLearningUpdate(update.id, {
    status,
    completed_at: new Date().toISOString(),
    promoted: decision.promoted,
    champion_evaluation_report_id: input.championEvaluationReportId ?? null,
    decision_reasons: decision.reasons,
    metric_deltas: decision.deltas,
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
  championReport?: {
    id: string;
    win_rate?: number;
    winRate?: number;
    net_pnl_after_fees?: number;
    netPnlAfterFees?: number;
    max_drawdown?: number;
    maxDrawdown?: number;
    trade_count?: number;
    tradeCount?: number;
  } | null;
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

  const challengerMetrics: LearningUpdateMetrics = {
    winRate: Number(report.win_rate ?? report.winRate ?? 0),
    netPnlAfterFees: Number(report.net_pnl_after_fees ?? report.netPnlAfterFees ?? 0),
    maxDrawdown: Number(report.max_drawdown ?? report.maxDrawdown ?? 0),
    tradeCount: Number(report.trade_count ?? report.tradeCount ?? 0),
  };
  const championMetrics = input.championReport
    ? {
        winRate: Number(input.championReport.win_rate ?? input.championReport.winRate ?? 0),
        netPnlAfterFees: Number(input.championReport.net_pnl_after_fees ?? input.championReport.netPnlAfterFees ?? 0),
        maxDrawdown: Number(input.championReport.max_drawdown ?? input.championReport.maxDrawdown ?? 0),
        tradeCount: Number(input.championReport.trade_count ?? input.championReport.tradeCount ?? 0),
      }
    : null;
  const decision = evaluatePromotionDecision({
    challenger: challengerMetrics,
    challengerStatus: report.status,
    champion: championMetrics,
  });

  if (decision.promoted) {
    await promoteAgentVersion(agentVersionId);
  } else if (input.rollbackVersionId && input.rollbackVersionId !== agentVersionId) {
    await rollbackAgentVersion(input.rollbackVersionId);
  }

  const status = decision.promoted ? "succeeded" : "failed";
  const updated = await updateLearningUpdate(update.id, {
    status,
    completed_at: new Date().toISOString(),
    champion_evaluation_report_id: input.championReport?.id ?? null,
    promoted: decision.promoted,
    decision_reasons: decision.reasons,
    metric_deltas: decision.deltas,
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
