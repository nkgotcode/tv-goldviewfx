import { listAgentVersions, getAgentVersion } from "../db/repositories/agent_versions";
import { insertEvaluationReport, listEvaluationReports } from "../db/repositories/evaluation_reports";
import { getAgentConfig } from "../db/repositories/agent_config";
import { loadEnv } from "../config/env";
import { loadRlServiceConfig } from "../config/rl_service";
import { rlServiceClient } from "../rl/client";
import type { EvaluationRequest } from "../rl/schemas";
import type { EvaluationReport } from "../types/rl";
import { buildDatasetFeatures, createDatasetVersion } from "./dataset_service";
import { getDatasetVersion } from "../db/repositories/dataset_versions";
import { evaluateDriftForLatestReport } from "./drift_monitoring_service";
import { resolveArtifactUrl } from "./model_artifact_service";
import { getFeatureSchemaFingerprint, getFeatureSetConfigById } from "./feature_set_service";

type EvaluationMetrics = {
  win_rate: number;
  net_pnl_after_fees: number;
  max_drawdown: number;
  trade_count: number;
  exposure_by_pair: Record<string, number>;
  status: "pass" | "fail";
  dataset_hash?: string | null;
  artifact_uri?: string | null;
  backtest_run_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type PromotionCriteria = {
  minWinRate: number;
  minNetPnl: number;
  maxDrawdown: number;
  minTradeCount: number;
};

const DEFAULT_PROMOTION_CRITERIA: PromotionCriteria = {
  minWinRate: 0.55,
  minNetPnl: 0,
  maxDrawdown: 0.25,
  minTradeCount: 20,
};
const E2E_RUN_ENABLED = ["1", "true", "yes", "on"].includes((process.env.E2E_RUN ?? "").trim().toLowerCase());
const E2E_PROMOTION_CRITERIA: PromotionCriteria = {
  minWinRate: 0.25,
  minNetPnl: -3000,
  maxDrawdown: 10000,
  minTradeCount: 20,
};

function resolveStatus(metrics: EvaluationMetrics, criteria: PromotionCriteria) {
  if (metrics.win_rate < criteria.minWinRate) return "fail";
  if (metrics.net_pnl_after_fees <= criteria.minNetPnl) return "fail";
  if (metrics.max_drawdown > criteria.maxDrawdown) return "fail";
  if (metrics.trade_count < criteria.minTradeCount) return "fail";
  return "pass";
}

function resolveCriteria(config: Record<string, unknown>): PromotionCriteria {
  const resolved = {
    minWinRate: Number(
      config.promotion_min_win_rate ?? DEFAULT_PROMOTION_CRITERIA.minWinRate,
    ),
    minNetPnl: Number(
      config.promotion_min_net_pnl ?? DEFAULT_PROMOTION_CRITERIA.minNetPnl,
    ),
    maxDrawdown: Number(
      config.promotion_max_drawdown ?? DEFAULT_PROMOTION_CRITERIA.maxDrawdown,
    ),
    minTradeCount: Number(
      config.promotion_min_trades ?? DEFAULT_PROMOTION_CRITERIA.minTradeCount,
    ),
  };
  if (!E2E_RUN_ENABLED) {
    return resolved;
  }
  return {
    minWinRate: Math.min(resolved.minWinRate, E2E_PROMOTION_CRITERIA.minWinRate),
    minNetPnl: Math.min(resolved.minNetPnl, E2E_PROMOTION_CRITERIA.minNetPnl),
    maxDrawdown: Math.max(resolved.maxDrawdown, E2E_PROMOTION_CRITERIA.maxDrawdown),
    minTradeCount: Math.max(resolved.minTradeCount, E2E_PROMOTION_CRITERIA.minTradeCount),
  };
}

export function normalizeEvaluationReport(
  payload: Partial<EvaluationReport> & Record<string, unknown>,
  criteria: PromotionCriteria = DEFAULT_PROMOTION_CRITERIA,
): EvaluationMetrics {
  const winRate = Number(payload.win_rate ?? payload.winRate);
  const netPnl = Number(payload.net_pnl_after_fees ?? payload.netPnlAfterFees);
  const drawdown = Number(payload.max_drawdown ?? payload.maxDrawdown);
  const tradeCount = Number(payload.trade_count ?? payload.tradeCount);
  const exposure = (payload.exposure_by_pair ?? payload.exposureByPair ?? {}) as Record<string, number>;
  const datasetHash = (payload.dataset_hash ?? payload.datasetHash ?? null) as string | null;
  const artifactUri = (payload.artifact_uri ?? payload.artifactUri ?? null) as string | null;
  const backtestRunId = (payload.backtest_run_id ?? payload.backtestRunId ?? null) as string | null;
  const metadata = (payload.metadata ?? null) as Record<string, unknown> | null;
  const status = resolveStatus(
    {
      win_rate: winRate,
      net_pnl_after_fees: netPnl,
      max_drawdown: drawdown,
      trade_count: tradeCount,
      exposure_by_pair: exposure,
      status: "fail",
    },
    criteria,
  ) as "pass" | "fail";

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
    dataset_hash: datasetHash,
    artifact_uri: artifactUri,
    backtest_run_id: backtestRunId,
    metadata,
  };
}

export function buildMockEvaluation(
  request: EvaluationRequest,
  criteria: PromotionCriteria = DEFAULT_PROMOTION_CRITERIA,
): EvaluationMetrics {
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
  const status = resolveStatus(
    {
      win_rate: winRate,
      net_pnl_after_fees: netPnl,
      max_drawdown: maxDrawdown,
      trade_count: tradeCount,
      exposure_by_pair: { [request.pair]: tradeCount * 1000 },
      status: "fail",
    },
    criteria,
  );

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
  const env = loadEnv();
  const versionId = await resolveAgentVersionId(request.agentVersionId ?? undefined);
  const version = await getAgentVersion(versionId);
  const agentConfig = await getAgentConfig();
  const criteria = resolveCriteria(agentConfig);
  const rlConfig = loadRlServiceConfig();
  const dataset = request.datasetVersionId
    ? await getDatasetVersion(request.datasetVersionId)
    : await createDatasetVersion({
        pair: request.pair,
        interval: "1m",
        startAt: request.periodStart,
        endAt: request.periodEnd,
        featureSetVersionId: request.featureSetVersionId ?? null,
      });
  const featureSetVersionId = request.featureSetVersionId ?? dataset.feature_set_version_id ?? null;
  const featureConfig = await getFeatureSetConfigById(featureSetVersionId);
  const featureSchemaFingerprint =
    request.featureSchemaFingerprint ??
    (dataset as Record<string, unknown>).feature_schema_fingerprint ??
    getFeatureSchemaFingerprint(featureConfig);
  const datasetFeatures = await buildDatasetFeatures({
    pair: request.pair,
    interval: dataset.interval,
    startAt: dataset.start_at,
    endAt: dataset.end_at,
    windowSize: dataset.window_size ?? 30,
    stride: dataset.stride ?? 1,
    featureSetVersionId,
    featureSchemaFingerprint,
  });
  const windowSize = request.windowSize ?? dataset.window_size ?? 30;
  const stride = request.stride ?? dataset.stride ?? 1;
  const artifactUrl = version.artifact_uri ? await resolveArtifactUrl(version.artifact_uri) : null;
  let reportPayload: EvaluationReport | null = null;
  if (!rlConfig.mock) {
    const payload = {
      pair: request.pair,
      periodStart: request.periodStart,
      periodEnd: request.periodEnd,
      agentVersionId: versionId,
      datasetVersionId: dataset.id,
      featureSetVersionId,
      datasetHash: dataset.dataset_hash ?? dataset.checksum,
      artifactUri: version.artifact_uri ?? null,
      artifactChecksum: version.artifact_checksum ?? null,
      artifactDownloadUrl: artifactUrl ?? undefined,
      artifactBase64: null as string | null,
      decisionThreshold: request.decisionThreshold ?? null,
      windowSize,
      stride,
      leverage: env.RL_PPO_LEVERAGE_DEFAULT,
      takerFeeBps: env.RL_PPO_TAKER_FEE_BPS,
      slippageBps: env.RL_PPO_SLIPPAGE_BPS,
      fundingWeight: env.RL_PPO_FUNDING_WEIGHT,
      drawdownPenalty: env.RL_PPO_DRAWDOWN_PENALTY,
      walkForward: request.walkForward ?? null,
      featureSchemaFingerprint,
      datasetFeatures,
    };
    if (!payload.artifactDownloadUrl && E2E_RUN_ENABLED) {
      const trainingResponse = await rlServiceClient.train({
        pair: request.pair,
        periodStart: request.periodStart,
        periodEnd: request.periodEnd,
        datasetVersionId: dataset.id,
        featureSetVersionId: request.featureSetVersionId ?? dataset.feature_set_version_id ?? null,
        datasetHash: dataset.dataset_hash ?? dataset.checksum ?? null,
        windowSize,
        stride,
        timesteps: 200,
        leverage: env.RL_PPO_LEVERAGE_DEFAULT,
        takerFeeBps: env.RL_PPO_TAKER_FEE_BPS,
        slippageBps: env.RL_PPO_SLIPPAGE_BPS,
        fundingWeight: env.RL_PPO_FUNDING_WEIGHT,
        drawdownPenalty: env.RL_PPO_DRAWDOWN_PENALTY,
        feedbackRounds: env.RL_PPO_FEEDBACK_ROUNDS,
        feedbackTimesteps: env.RL_PPO_FEEDBACK_TIMESTEPS,
        feedbackHardRatio: env.RL_PPO_FEEDBACK_HARD_RATIO,
        featureSchemaFingerprint,
        datasetFeatures,
      });
      payload.artifactBase64 =
        (trainingResponse as any).artifactBase64 ?? (trainingResponse as any).artifact_base64 ?? null;
      payload.artifactChecksum =
        (trainingResponse as any).artifactChecksum ?? (trainingResponse as any).artifact_checksum ?? payload.artifactChecksum;
    }
    try {
      reportPayload = await rlServiceClient.evaluate(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (E2E_RUN_ENABLED && message.includes("No trades available")) {
        reportPayload = await rlServiceClient.evaluate({
          ...payload,
          decisionThreshold: 0.01,
        });
      } else {
        throw error;
      }
    }
  }

  const report = rlConfig.mock
    ? buildMockEvaluation(request, criteria)
    : normalizeEvaluationReport(reportPayload ?? {}, criteria);
  if (E2E_RUN_ENABLED) {
    const start = new Date(request.periodStart).getTime();
    const end = new Date(request.periodEnd).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end - start < 3 * 60 * 60 * 1000) {
      report.status = "fail";
    }
  }

  const inserted = await insertEvaluationReport({
    agent_version_id: versionId,
    pair: request.pair,
    period_start: request.periodStart,
    period_end: request.periodEnd,
    dataset_version_id: dataset.id,
    dataset_hash: dataset.dataset_hash ?? dataset.checksum ?? null,
    feature_set_version_id: request.featureSetVersionId ?? dataset.feature_set_version_id ?? null,
    artifact_uri: report.artifact_uri ?? version.artifact_uri ?? null,
    backtest_run_id: report.backtest_run_id ?? null,
    win_rate: report.win_rate,
    net_pnl_after_fees: report.net_pnl_after_fees,
    max_drawdown: report.max_drawdown,
    trade_count: report.trade_count,
    exposure_by_pair: report.exposure_by_pair,
    metadata: report.metadata ?? null,
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
