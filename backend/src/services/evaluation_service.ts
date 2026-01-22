import { listAgentVersions, getAgentVersion } from "../db/repositories/agent_versions";
import { insertEvaluationReport, listEvaluationReports } from "../db/repositories/evaluation_reports";
import { loadRlServiceConfig } from "../config/rl_service";
import { rlServiceClient } from "../rl/client";
import type { EvaluationRequest } from "../rl/schemas";
import type { EvaluationReport } from "../types/rl";
import { createDatasetVersion } from "./dataset_service";
import { getDatasetVersion } from "../db/repositories/dataset_versions";
import { evaluateDriftForLatestReport } from "./drift_monitoring_service";

type EvaluationMetrics = {
  win_rate: number;
  net_pnl_after_fees: number;
  max_drawdown: number;
  trade_count: number;
  exposure_by_pair: Record<string, number>;
  status: "pass" | "fail";
};

const PROMOTION_CRITERIA = {
  minWinRate: 0.55,
  minNetPnl: 0,
  maxDrawdown: 0.25,
  minTradeCount: 20,
};

function resolveStatus(metrics: EvaluationMetrics) {
  if (metrics.win_rate < PROMOTION_CRITERIA.minWinRate) return "fail";
  if (metrics.net_pnl_after_fees <= PROMOTION_CRITERIA.minNetPnl) return "fail";
  if (metrics.max_drawdown > PROMOTION_CRITERIA.maxDrawdown) return "fail";
  if (metrics.trade_count < PROMOTION_CRITERIA.minTradeCount) return "fail";
  return "pass";
}

export function normalizeEvaluationReport(payload: Partial<EvaluationReport> & Record<string, unknown>): EvaluationMetrics {
  const winRate = Number(payload.win_rate ?? payload.winRate);
  const netPnl = Number(payload.net_pnl_after_fees ?? payload.netPnlAfterFees);
  const drawdown = Number(payload.max_drawdown ?? payload.maxDrawdown);
  const tradeCount = Number(payload.trade_count ?? payload.tradeCount);
  const exposure = (payload.exposure_by_pair ?? payload.exposureByPair ?? {}) as Record<string, number>;
  const status = (payload.status ?? resolveStatus({
    win_rate: winRate,
    net_pnl_after_fees: netPnl,
    max_drawdown: drawdown,
    trade_count: tradeCount,
    exposure_by_pair: exposure,
    status: "fail",
  })) as "pass" | "fail";

  if (!Number.isFinite(winRate) || !Number.isFinite(netPnl) || !Number.isFinite(drawdown) || !Number.isFinite(tradeCount)) {
    throw new Error("Invalid evaluation payload from RL service");
  }

  return {
    win_rate: winRate,
    net_pnl_after_fees: netPnl,
    max_drawdown: drawdown,
    trade_count: tradeCount,
    exposure_by_pair: exposure,
    status,
  };
}

export function buildMockEvaluation(request: EvaluationRequest): EvaluationMetrics {
  const start = new Date(request.periodStart);
  const end = new Date(request.periodEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid evaluation period");
  }
  const durationHours = Math.floor((end.getTime() - start.getTime()) / (60 * 60 * 1000));
  if (durationHours <= 0) {
    throw new Error("No trades available for evaluation window");
  }
  const tradeCount = durationHours;
  const winRate = Math.min(0.85, 0.4 + Math.min(tradeCount, 40) * 0.01);
  const netPnl = tradeCount * 4 - 12;
  const maxDrawdown = Math.max(0.1, 0.35 - winRate * 0.2);
  const status = resolveStatus({
    win_rate: winRate,
    net_pnl_after_fees: netPnl,
    max_drawdown: maxDrawdown,
    trade_count: tradeCount,
    exposure_by_pair: { [request.pair]: tradeCount * 1000 },
    status: "fail",
  });

  return {
    win_rate: winRate,
    net_pnl_after_fees: netPnl,
    max_drawdown: maxDrawdown,
    trade_count: tradeCount,
    exposure_by_pair: { [request.pair]: tradeCount * 1000 },
    status,
  };
}

async function resolveAgentVersionId(agentVersionId?: string | null) {
  if (agentVersionId) {
    const version = await getAgentVersion(agentVersionId);
    return version.id;
  }
  const promoted = await listAgentVersions({ status: "promoted" });
  if (promoted.length > 0) {
    return promoted[0].id;
  }
  const versions = await listAgentVersions();
  if (versions.length > 0) {
    return versions[0].id;
  }
  throw new Error("No agent versions available");
}

export async function runEvaluation(request: EvaluationRequest) {
  const versionId = await resolveAgentVersionId(request.agentVersionId ?? undefined);
  const config = loadRlServiceConfig();
  const report = config.mock ? buildMockEvaluation(request) : normalizeEvaluationReport(await rlServiceClient.evaluate({
    pair: request.pair,
    periodStart: request.periodStart,
    periodEnd: request.periodEnd,
    agentVersionId: versionId,
  }));
  const dataset = request.datasetVersionId
    ? await getDatasetVersion(request.datasetVersionId)
    : await createDatasetVersion({
        pair: request.pair,
        interval: "1m",
        startAt: request.periodStart,
        endAt: request.periodEnd,
        featureSetVersionId: request.featureSetVersionId ?? null,
      });

  const inserted = await insertEvaluationReport({
    agent_version_id: versionId,
    pair: request.pair,
    period_start: request.periodStart,
    period_end: request.periodEnd,
    dataset_version_id: dataset.id,
    feature_set_version_id: request.featureSetVersionId ?? dataset.feature_set_version_id ?? null,
    win_rate: report.win_rate,
    net_pnl_after_fees: report.net_pnl_after_fees,
    max_drawdown: report.max_drawdown,
    trade_count: report.trade_count,
    exposure_by_pair: report.exposure_by_pair,
    status: report.status,
  });

  await evaluateDriftForLatestReport({
    agentId: "gold-rl-agent",
    agentVersionId: versionId,
  }).catch(() => {});

  return inserted;
}

export async function listEvaluations(agentVersionId?: string) {
  return listEvaluationReports(agentVersionId);
}
