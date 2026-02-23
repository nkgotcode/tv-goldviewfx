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

export type PromotionGates = {
  minWinRate: number;
  minNetPnl: number;
  maxDrawdown: number;
  minTradeCount: number;
  minWinRateDelta: number;
  minNetPnlDelta: number;
  maxDrawdownDelta: number;
  minTradeCountDelta: number;
  minEffectSize: number;
  minConfidenceZ: number;
  minSampleSize: number;
};

export type RolloutPolicy = {
  mode: "shadow" | "canary" | "full";
  canaryMinTradeCount: number;
  canaryMaxDrawdown: number;
};

function resolvePromotionGates(overrides?: Partial<PromotionGates> | null): PromotionGates {
  const env = loadEnv();
  return {
    minWinRate: overrides?.minWinRate ?? env.RL_ONLINE_LEARNING_MIN_WIN_RATE,
    minNetPnl: overrides?.minNetPnl ?? env.RL_ONLINE_LEARNING_MIN_NET_PNL,
    maxDrawdown: overrides?.maxDrawdown ?? env.RL_ONLINE_LEARNING_MAX_DRAWDOWN,
    minTradeCount: overrides?.minTradeCount ?? env.RL_ONLINE_LEARNING_MIN_TRADE_COUNT,
    minWinRateDelta: overrides?.minWinRateDelta ?? env.RL_ONLINE_LEARNING_MIN_WIN_RATE_DELTA,
    minNetPnlDelta: overrides?.minNetPnlDelta ?? env.RL_ONLINE_LEARNING_MIN_NET_PNL_DELTA,
    maxDrawdownDelta: overrides?.maxDrawdownDelta ?? env.RL_ONLINE_LEARNING_MAX_DRAWDOWN_DELTA,
    minTradeCountDelta: overrides?.minTradeCountDelta ?? env.RL_ONLINE_LEARNING_MIN_TRADE_COUNT_DELTA,
    minEffectSize: overrides?.minEffectSize ?? env.RL_ONLINE_LEARNING_MIN_EFFECT_SIZE,
    minConfidenceZ: overrides?.minConfidenceZ ?? env.RL_ONLINE_LEARNING_MIN_CONFIDENCE_Z,
    minSampleSize: overrides?.minSampleSize ?? env.RL_ONLINE_LEARNING_MIN_SAMPLE_SIZE,
  };
}

function resolveRolloutPolicy(overrides?: Partial<RolloutPolicy> | null): RolloutPolicy {
  const env = loadEnv();
  return {
    mode: overrides?.mode ?? env.RL_ONLINE_LEARNING_ROLLOUT_MODE,
    canaryMinTradeCount: overrides?.canaryMinTradeCount ?? env.RL_ONLINE_LEARNING_CANARY_MIN_TRADE_COUNT,
    canaryMaxDrawdown: overrides?.canaryMaxDrawdown ?? env.RL_ONLINE_LEARNING_CANARY_MAX_DRAWDOWN,
  };
}

type PromotionDecision = {
  promoted: boolean;
  reasons: string[];
  deltas: Record<string, number>;
};

function clampProbability(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function computeWinRateConfidenceZ(params: {
  challengerWinRate: number;
  championWinRate: number;
  challengerTrades: number;
  championTrades: number;
}) {
  const challengerTrades = Math.max(0, Math.floor(params.challengerTrades));
  const championTrades = Math.max(0, Math.floor(params.championTrades));
  if (challengerTrades === 0 || championTrades === 0) return null;
  const challengerWinRate = clampProbability(params.challengerWinRate);
  const championWinRate = clampProbability(params.championWinRate);
  const pooled =
    (challengerWinRate * challengerTrades + championWinRate * championTrades) / (challengerTrades + championTrades);
  const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / challengerTrades + 1 / championTrades));
  if (!Number.isFinite(standardError) || standardError <= 0) return null;
  return (challengerWinRate - championWinRate) / standardError;
}

export function evaluatePromotionDecision(params: {
  challenger: LearningUpdateMetrics;
  challengerStatus?: "pass" | "fail";
  champion?: LearningUpdateMetrics | null;
  promotionGates?: Partial<PromotionGates> | null;
}): PromotionDecision {
  const gates = resolvePromotionGates(params.promotionGates);
  const challenger = params.challenger;
  const champion = params.champion ?? null;
  const reasons: string[] = [];
  const confidenceZ = champion
    ? computeWinRateConfidenceZ({
        challengerWinRate: challenger.winRate,
        championWinRate: champion.winRate,
        challengerTrades: challenger.tradeCount,
        championTrades: champion.tradeCount,
      })
    : null;
  const deltas = {
    winRateDelta: champion ? challenger.winRate - champion.winRate : challenger.winRate,
    netPnlDelta: champion ? challenger.netPnlAfterFees - champion.netPnlAfterFees : challenger.netPnlAfterFees,
    drawdownDelta: champion ? challenger.maxDrawdown - champion.maxDrawdown : challenger.maxDrawdown,
    tradeCountDelta: champion ? challenger.tradeCount - champion.tradeCount : challenger.tradeCount,
    winRateEffectSize: champion ? Math.abs(challenger.winRate - champion.winRate) : Math.abs(challenger.winRate),
    winRateConfidenceZ: Number.isFinite(confidenceZ ?? NaN) ? Number(confidenceZ) : 0,
  };

  if (params.challengerStatus === "fail") reasons.push("challenger_report_failed");
  if (challenger.winRate < gates.minWinRate) reasons.push("win_rate_below_threshold");
  if (challenger.netPnlAfterFees <= gates.minNetPnl) reasons.push("net_pnl_non_positive");
  if (challenger.maxDrawdown > gates.maxDrawdown) reasons.push("drawdown_too_high");
  if (challenger.tradeCount < gates.minTradeCount) reasons.push("insufficient_trade_count");

  if (champion) {
    if (deltas.winRateDelta < gates.minWinRateDelta) reasons.push("win_rate_delta_below_gate");
    if (deltas.netPnlDelta < gates.minNetPnlDelta) reasons.push("net_pnl_delta_below_gate");
    if (deltas.drawdownDelta > gates.maxDrawdownDelta) reasons.push("drawdown_delta_above_gate");
    if (deltas.tradeCountDelta < gates.minTradeCountDelta) reasons.push("trade_count_delta_below_gate");
    if (Math.min(challenger.tradeCount, champion.tradeCount) < gates.minSampleSize) reasons.push("insufficient_sample_size");
    if (deltas.winRateEffectSize < gates.minEffectSize) reasons.push("effect_size_below_gate");
    if (gates.minConfidenceZ > 0) {
      if (!Number.isFinite(confidenceZ ?? NaN)) {
        reasons.push("confidence_unavailable");
      } else if ((confidenceZ ?? 0) < gates.minConfidenceZ) {
        reasons.push("confidence_below_gate");
      }
    }
  }

  return {
    promoted: reasons.length === 0,
    reasons,
    deltas,
  };
}

function applyRolloutPolicy(
  decision: PromotionDecision,
  challenger: LearningUpdateMetrics,
  champion: LearningUpdateMetrics | null,
  rolloutPolicy?: Partial<RolloutPolicy> | null,
): PromotionDecision {
  const policy = resolveRolloutPolicy(rolloutPolicy);
  const reasons = [...decision.reasons];
  if (!decision.promoted) {
    reasons.push("rollout_stage:rejected");
    return { ...decision, reasons };
  }

  if (policy.mode === "full") {
    reasons.push("rollout_stage:full");
    return { ...decision, reasons };
  }
  if (policy.mode === "shadow") {
    reasons.push("rollout_stage:shadow");
    reasons.push("rollout_shadow_only");
    return { ...decision, promoted: false, reasons };
  }

  if (champion) {
    if (challenger.tradeCount < policy.canaryMinTradeCount) {
      reasons.push("rollout_stage:canary");
      reasons.push("canary_insufficient_trade_count");
      return { ...decision, promoted: false, reasons };
    }
    if (challenger.maxDrawdown > policy.canaryMaxDrawdown) {
      reasons.push("rollout_stage:canary");
      reasons.push("canary_drawdown_breach");
      return { ...decision, promoted: false, reasons };
    }
  }

  reasons.push("rollout_stage:canary");
  reasons.push("rollout_stage:full");
  return { ...decision, reasons };
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
  const rolloutDecision = applyRolloutPolicy(decision, input.metrics, input.championMetrics ?? null, null);
  if (rolloutDecision.promoted) {
    await promoteAgentVersion(input.agentVersionId);
  } else if (input.rollbackVersionId) {
    await rollbackAgentVersion(input.rollbackVersionId);
  }

  const status = rolloutDecision.promoted ? "succeeded" : "failed";
  const updated = await updateLearningUpdate(update.id, {
    status,
    completed_at: new Date().toISOString(),
    promoted: rolloutDecision.promoted,
    champion_evaluation_report_id: input.championEvaluationReportId ?? null,
    decision_reasons: rolloutDecision.reasons,
    metric_deltas: rolloutDecision.deltas,
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
  promotionGates?: Partial<PromotionGates> | null;
  rolloutPolicy?: Partial<RolloutPolicy> | null;
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
    promotionGates: input.promotionGates,
  });
  const rolloutDecision = applyRolloutPolicy(decision, challengerMetrics, championMetrics, input.rolloutPolicy);

  if (rolloutDecision.promoted) {
    await promoteAgentVersion(agentVersionId);
  } else if (input.rollbackVersionId && input.rollbackVersionId !== agentVersionId) {
    await rollbackAgentVersion(input.rollbackVersionId);
  }

  const status = rolloutDecision.promoted ? "succeeded" : "failed";
  const updated = await updateLearningUpdate(update.id, {
    status,
    completed_at: new Date().toISOString(),
    champion_evaluation_report_id: input.championReport?.id ?? null,
    promoted: rolloutDecision.promoted,
    decision_reasons: rolloutDecision.reasons,
    metric_deltas: rolloutDecision.deltas,
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
