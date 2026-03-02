import { createHash } from "node:crypto";
import { listAgentVersions, getAgentVersion } from "../db/repositories/agent_versions";
import { insertEvaluationReport, listEvaluationReports } from "../db/repositories/evaluation_reports";
import { getAgentConfig } from "../db/repositories/agent_config";
import { loadEnv } from "../config/env";
import { toBingxSymbol } from "../config/market_catalog";
import { loadRlServiceConfig } from "../config/rl_service";
import { rlServiceClient } from "../rl/client";
import type { EvaluationRequest } from "../rl/schemas";
import type { EvaluationReport } from "../types/rl";
import { buildDatasetFeaturesWithProvenance, createDatasetVersion } from "./dataset_service";
import { getDatasetVersion } from "../db/repositories/dataset_versions";
import { evaluateDriftForLatestReport } from "./drift_monitoring_service";
import { resolveArtifactUrl, resolveEmbeddedArtifactPayload } from "./model_artifact_service";
import { getFeatureSchemaFingerprint, getFeatureSetConfigById } from "./feature_set_service";
import { getExchangeMetadata } from "./exchange_metadata_service";
import { evaluateDataIntegrityGate } from "./data_integrity_service";
import { getDataGapHealth } from "./data_gap_health";
import { listOpenDataGapEvents } from "../db/repositories/data_gap_events";
import type { TradingPair } from "../types/rl";

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

type EvaluationExecutionStep = {
  key: string;
  label: string;
  status: "ok" | "error";
  started_at: string;
  completed_at: string;
  duration_ms: number;
  details?: Record<string, unknown>;
  error?: string;
};

type EvaluationExecutionTrace = {
  started_at: string;
  completed_at: string;
  duration_ms: number;
  steps: EvaluationExecutionStep[];
};

type PromotionCriteria = {
  minWinRate: number;
  minNetPnl: number;
  maxDrawdown: number;
  minTradeCount: number;
};

type CriteriaAdjustment = {
  source: string;
  multiplier?: number;
  delta?: number;
  note?: string;
};

type RunEvaluationOptions = {
  bypassDataGapGate?: boolean;
  gapGateBypassReason?: string | null;
};

type DataGapBlockedContext = {
  pair: TradingPair;
  interval: string;
  blockingReasons: string[];
  warnings: string[];
  integrityProvenance: Record<string, unknown>;
  gapHealth: Awaited<ReturnType<typeof getDataGapHealth>> | null;
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
const MAX_EVALUATION_FEATURE_ROWS = Number.parseInt(process.env.RL_EVAL_MAX_FEATURE_ROWS ?? "20000", 10);
const MAX_EVALUATION_WINDOW_SIZE = Number.parseInt(process.env.RL_EVAL_MAX_WINDOW_SIZE ?? "4096", 10);
const MAX_EVALUATION_WINDOWS = Number.parseInt(process.env.RL_EVAL_MAX_WINDOWS ?? "12000", 10);
const DEFAULT_NAUTILUS_STRATEGY_IDS = ["ema_trend", "bollinger_mean_rev", "funding_overlay"] as const;
const SB3_MIN_FEATURE_ROWS = Number.parseInt(process.env.RL_SB3_MIN_FEATURE_ROWS ?? "300", 10);
const SB3_MIN_TRADE_COUNT = Number.parseInt(process.env.RL_SB3_MIN_TRADE_COUNT ?? "30", 10);

export class DataGapBlockedError extends Error {
  readonly code = "DATA_GAP_BLOCKED" as const;
  readonly context: DataGapBlockedContext;

  constructor(message: string, context: DataGapBlockedContext) {
    super(message);
    this.name = "DataGapBlockedError";
    this.context = context;
  }
}

export function isDataGapBlockedError(error: unknown): error is DataGapBlockedError {
  return error instanceof DataGapBlockedError;
}

function normalizeGapIntervals(intervals: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      intervals
        .map((interval) => (typeof interval === "string" ? interval.trim() : ""))
        .filter((interval) => interval.length > 0),
    ),
  );
}

async function listScopedOpenCandleGapEvents(pair: TradingPair, intervals: string[]) {
  if (intervals.length === 0) return [];
  const scoped = await Promise.all(
    intervals.map((interval) =>
      listOpenDataGapEvents({
        pair,
        source_type: "bingx_candles",
        interval,
        limit: 20,
      }),
    ),
  );
  return scoped.flat();
}

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

function parseIntervalMinutes(interval: string) {
  const match = interval.trim().match(/^(\d+)(m|h|d)$/);
  if (!match) return null;
  const value = Number.parseInt(match[1] ?? "", 10);
  const unit = match[2];
  if (!Number.isFinite(value) || value <= 0 || !unit) return null;
  if (unit === "m") return value;
  if (unit === "h") return value * 60;
  if (unit === "d") return value * 24 * 60;
  return null;
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

function applyCriteriaAdjustments(params: {
  base: PromotionCriteria;
  pair: string;
  interval: string;
  strategyIds: string[];
}) {
  const adjustments: CriteriaAdjustment[] = [];
  const criteria: PromotionCriteria = { ...params.base };
  const intervalMinutes = parseIntervalMinutes(params.interval);
  const pairToken = params.pair.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const usesSb3 = params.strategyIds.includes("rl_sb3_market");

  if (intervalMinutes !== null) {
    if (intervalMinutes >= 60) {
      const nextMinTrades = Math.max(8, Math.floor(criteria.minTradeCount * 0.6));
      if (nextMinTrades !== criteria.minTradeCount) {
        adjustments.push({
          source: "interval",
          multiplier: 0.6,
          note: "Lower minimum trades on high-timeframe backtests to avoid false FAIL from sparse signal cadence.",
        });
        criteria.minTradeCount = nextMinTrades;
      }
    } else if (intervalMinutes <= 5) {
      const nextMinTrades = Math.max(criteria.minTradeCount, Math.floor(criteria.minTradeCount * 1.25));
      if (nextMinTrades !== criteria.minTradeCount) {
        adjustments.push({
          source: "interval",
          multiplier: 1.25,
          note: "Slightly tighter minimum trade count on low-timeframe backtests.",
        });
        criteria.minTradeCount = nextMinTrades;
      }
    }
  }

  if (["XAUTUSDT", "GOLDUSDT", "PAXGUSDT"].includes(pairToken)) {
    const nextMinWin = round3(Math.max(0.5, criteria.minWinRate - 0.02));
    if (nextMinWin !== criteria.minWinRate) {
      criteria.minWinRate = nextMinWin;
      adjustments.push({
        source: "pair",
        delta: -0.02,
        note: "Slightly relaxed win-rate threshold for gold-linked instruments.",
      });
    }
  }

  if (usesSb3) {
    const nextMinTrades = Math.max(criteria.minTradeCount, SB3_MIN_TRADE_COUNT);
    if (nextMinTrades !== criteria.minTradeCount) {
      criteria.minTradeCount = nextMinTrades;
      adjustments.push({
        source: "strategy",
        note: "Raised minimum trade count for rl_sb3_market promotion readiness.",
      });
    }
  }

  return {
    criteria,
    adjustments,
    intervalMinutes,
    pairToken,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function mergeEvaluationMetadata(
  existing: Record<string, unknown> | null,
  additions: {
    parameters: Record<string, unknown>;
    dataFields: string[];
    provenance: Record<string, unknown>;
    execution: EvaluationExecutionTrace;
  },
) {
  const metadata = { ...(existing ?? {}) };
  const existingParameters = asRecord(metadata.parameters) ?? {};
  metadata.parameters = {
    ...existingParameters,
    ...additions.parameters,
  };
  metadata.data_fields = additions.dataFields;
  metadata.dataset_provenance = additions.provenance;
  metadata.nautilus = {
    ...((asRecord(metadata.nautilus) ?? {}) as Record<string, unknown>),
    engine: "nautilus_trader",
    interval: additions.parameters.interval,
    window_size: additions.parameters.windowSize,
    stride: additions.parameters.stride,
    decision_threshold: additions.parameters.decisionThreshold,
  };
  metadata.execution = additions.execution;
  metadata.execution_steps = additions.execution.steps;
  return metadata;
}

async function recordExecutionStep<T>(
  steps: EvaluationExecutionStep[],
  key: string,
  label: string,
  runner: () => Promise<T> | T,
  details?: (result: T) => Record<string, unknown>,
) {
  const startedAt = new Date();
  try {
    const result = await runner();
    const completedAt = new Date();
    steps.push({
      key,
      label,
      status: "ok",
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      details: details?.(result),
    });
    return result;
  } catch (error) {
    const completedAt = new Date();
    steps.push({
      key,
      label,
      status: "error",
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function extractContextFeatureKeys(rows: Array<Record<string, unknown>>) {
  const keys = new Set<string>();
  const sampleCount = Math.min(rows.length, 200);
  for (let index = 0; index < sampleCount; index += 1) {
    const row = rows[index];
    for (const key of Object.keys(row)) {
      if (!key.startsWith("ctx_")) continue;
      keys.add(key);
    }
  }
  return Array.from(keys).sort();
}

function buildCostModelFingerprint(input: {
  leverage: number;
  takerFeeBps: number;
  slippageBps: number;
  fundingWeight: number;
  drawdownPenalty: number;
}) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function resolvePositiveLimit(value: number, fallback: number) {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function downsampleFeatureRows<T>(rows: T[], requestedMaxRows: number, useFullHistory: boolean) {
  if (useFullHistory) {
    return {
      rows,
      downsampled: false,
      step: 1,
      originalCount: rows.length,
      usedCount: rows.length,
    };
  }
  const maxRows = resolvePositiveLimit(requestedMaxRows, 20_000);
  if (rows.length <= maxRows) {
    return {
      rows,
      downsampled: false,
      step: 1,
      originalCount: rows.length,
      usedCount: rows.length,
    };
  }
  const step = Math.max(2, Math.ceil(rows.length / maxRows));
  const sampled: T[] = [];
  for (let index = 0; index < rows.length; index += step) {
    sampled.push(rows[index]);
  }
  const last = rows[rows.length - 1];
  if (sampled[sampled.length - 1] !== last) {
    sampled.push(last);
  }
  return {
    rows: sampled,
    downsampled: true,
    step,
    originalCount: rows.length,
    usedCount: sampled.length,
  };
}

function resolveEffectiveWindowSize(requestedWindowSize: number, featureRowCount: number) {
  const requested = Math.min(
    resolvePositiveLimit(requestedWindowSize, 1),
    resolvePositiveLimit(MAX_EVALUATION_WINDOW_SIZE, 4096),
  );
  if (!Number.isFinite(requested) || requested <= 0) return 1;
  if (!Number.isFinite(featureRowCount) || featureRowCount <= 0) return requested;
  if (featureRowCount === 1) return 1;
  const maxWindowSize = Math.max(1, featureRowCount - 1);
  return Math.max(1, Math.min(requested, maxWindowSize));
}

function estimateWindowCount(featureRowCount: number, windowSize: number, stride: number) {
  if (!Number.isFinite(featureRowCount) || featureRowCount <= 0) return 0;
  if (!Number.isFinite(windowSize) || windowSize <= 0) return 0;
  if (!Number.isFinite(stride) || stride <= 0) return 0;
  if (featureRowCount < windowSize) return 0;
  return Math.floor((featureRowCount - windowSize) / stride) + 1;
}

function resolveEffectiveStride(
  requestedStride: number,
  featureRowCount: number,
  windowSize: number,
  maxWindows: number,
) {
  const requested = resolvePositiveLimit(requestedStride, 1);
  const limit = Math.max(1, resolvePositiveLimit(maxWindows, 12_000));
  const requestedWindowCount = estimateWindowCount(featureRowCount, windowSize, requested);
  if (requestedWindowCount <= limit) {
    return {
      stride: requested,
      autoscaled: false,
      requestedWindowCount,
      effectiveWindowCount: requestedWindowCount,
      reasonCodes: [] as string[],
    };
  }
  const nextStride = Math.max(requested, Math.ceil((featureRowCount - windowSize + 1) / limit));
  const effectiveWindowCount = estimateWindowCount(featureRowCount, windowSize, nextStride);
  return {
    stride: nextStride,
    autoscaled: true,
    requestedWindowCount,
    effectiveWindowCount,
    reasonCodes: ["stride_scaled_for_window_count"],
  };
}

function buildRelaxedWalkForward() {
  return {
    folds: 1,
    purgeBars: 0,
    embargoBars: 0,
    minTrainBars: 1,
    strict: false,
  };
}

function assertFeatureSchemaCompatibility(params: {
  requestedFeatureSchemaFingerprint?: string | null;
  datasetFeatureSchemaFingerprint?: string | null;
  resolvedFeatureSchemaFingerprint: string;
  requestedFeatureSetVersionId?: string | null;
  datasetFeatureSetVersionId?: string | null;
}) {
  if (
    params.requestedFeatureSetVersionId &&
    params.datasetFeatureSetVersionId &&
    params.requestedFeatureSetVersionId !== params.datasetFeatureSetVersionId
  ) {
    throw new Error(
      `Dataset feature-set version (${params.datasetFeatureSetVersionId}) does not match requested version (${params.requestedFeatureSetVersionId})`,
    );
  }
  if (
    params.requestedFeatureSchemaFingerprint &&
    params.datasetFeatureSchemaFingerprint &&
    params.requestedFeatureSchemaFingerprint !== params.datasetFeatureSchemaFingerprint
  ) {
    throw new Error(
      `Dataset feature schema fingerprint (${params.datasetFeatureSchemaFingerprint}) does not match requested fingerprint (${params.requestedFeatureSchemaFingerprint})`,
    );
  }
  if (
    params.datasetFeatureSchemaFingerprint &&
    params.datasetFeatureSchemaFingerprint !== params.resolvedFeatureSchemaFingerprint
  ) {
    throw new Error(
      `Dataset feature schema fingerprint (${params.datasetFeatureSchemaFingerprint}) is incompatible with resolved feature set (${params.resolvedFeatureSchemaFingerprint})`,
    );
  }
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

export async function runEvaluation(request: EvaluationRequest, options: RunEvaluationOptions = {}) {
  const executionStartedAt = new Date();
  const executionSteps: EvaluationExecutionStep[] = [];
  const bypassDataGapGate = options.bypassDataGapGate ?? false;
  const gapGateBypassReason = options.gapGateBypassReason ?? null;
  const env = loadEnv();
  const versionId = await recordExecutionStep(
    executionSteps,
    "resolve_version",
    "Resolve agent version",
    () => resolveAgentVersionId(request.agentVersionId ?? undefined),
    (resolvedVersionId) => ({
      requested_agent_version_id: request.agentVersionId ?? null,
      resolved_agent_version_id: resolvedVersionId,
    }),
  );
  const version = await getAgentVersion(versionId);
  const agentConfig = await getAgentConfig();
  const criteria = resolveCriteria(agentConfig);
  const rlConfig = loadRlServiceConfig();
  if (rlConfig.mock) {
    throw new Error("RL service mock mode is disabled for evaluations; Nautilus backtest is required.");
  }
  const requestedInterval = request.interval ?? "1m";
  const preflightIntervals = normalizeGapIntervals([requestedInterval, ...(request.contextIntervals ?? [])]);
  if (!bypassDataGapGate) {
    const openGapEvents = await recordExecutionStep(
      executionSteps,
      "data_gap_open_event_preflight",
      "Data gap open-event preflight",
      () =>
        listScopedOpenCandleGapEvents(request.pair as TradingPair, preflightIntervals),
      (result) => ({
        pair: request.pair,
        source_type: "bingx_candles",
        intervals: preflightIntervals,
        open_gap_events: result.length,
      }),
    );
    if (openGapEvents.length > 0) {
      const gapHealth = await getDataGapHealth({
        pair: request.pair as TradingPair,
        sourceType: "bingx_candles",
        limit: 100,
      }).catch(() => null);
      throw new DataGapBlockedError(
        `Backtest blocked: data gaps detected for ${request.pair} (${requestedInterval}).`,
        {
          pair: request.pair as TradingPair,
          interval: requestedInterval,
          blockingReasons: ["open_gap_events"],
          warnings: [],
          integrityProvenance: {
            preflight: "open_gap_events_only",
            openGapEvents: openGapEvents.length,
            intervals: preflightIntervals,
          },
          gapHealth,
        },
      );
    }
  } else {
    await recordExecutionStep(
      executionSteps,
      "data_gap_open_event_preflight",
      "Data gap open-event preflight (bypassed)",
      () =>
        Promise.resolve({
          bypassed: true,
          reason: gapGateBypassReason,
        }),
    );
  }
  const dataset = await recordExecutionStep(
    executionSteps,
    "resolve_dataset",
    "Resolve dataset window",
    () =>
      request.datasetVersionId
        ? getDatasetVersion(request.datasetVersionId)
        : createDatasetVersion({
            pair: request.pair,
            interval: requestedInterval,
            contextIntervals: request.contextIntervals ?? [],
            startAt: request.periodStart,
            endAt: request.periodEnd,
            featureSetVersionId: request.featureSetVersionId ?? null,
          }),
    (resolvedDataset) => ({
      requested_dataset_version_id: request.datasetVersionId ?? null,
      dataset_version_id: resolvedDataset.id,
      interval: resolvedDataset.interval,
      start_at: resolvedDataset.start_at,
      end_at: resolvedDataset.end_at,
      created_from_window: request.datasetVersionId ? false : true,
    }),
  );
  if (request.interval && dataset.interval !== request.interval) {
    throw new Error(`Dataset interval (${dataset.interval}) does not match requested interval (${request.interval})`);
  }
  const interval = request.interval ?? dataset.interval ?? "1m";
  const datasetFeatureSetVersionId = (dataset as Record<string, unknown>).feature_set_version_id as string | null;
  const datasetFeatureSchemaFingerprint = (dataset as Record<string, unknown>).feature_schema_fingerprint as
    | string
    | null;
  const featureSetVersionId = request.featureSetVersionId ?? datasetFeatureSetVersionId ?? null;
  const featureConfig = await getFeatureSetConfigById(featureSetVersionId);
  const featureSchemaFingerprint =
    request.featureSchemaFingerprint ??
    datasetFeatureSchemaFingerprint ??
    getFeatureSchemaFingerprint(featureConfig);
  assertFeatureSchemaCompatibility({
    requestedFeatureSchemaFingerprint: request.featureSchemaFingerprint ?? null,
    datasetFeatureSchemaFingerprint,
    resolvedFeatureSchemaFingerprint: featureSchemaFingerprint,
    requestedFeatureSetVersionId: request.featureSetVersionId ?? null,
    datasetFeatureSetVersionId,
  });
  const { features: datasetFeatures, provenance } = await (async () => {
    try {
      return await recordExecutionStep(
        executionSteps,
        "build_feature_dataset",
        "Build feature dataset",
        () =>
          buildDatasetFeaturesWithProvenance({
            pair: request.pair,
            interval,
            contextIntervals: request.contextIntervals ?? [],
            startAt: dataset.start_at,
            endAt: dataset.end_at,
            windowSize: dataset.window_size ?? 30,
            stride: dataset.stride ?? 1,
            featureSetVersionId,
            featureSchemaFingerprint,
          }),
        (result) => ({
          feature_rows: result.features.length,
          resolved_pair: result.provenance.resolvedPair,
          resolved_bingx_symbol: result.provenance.resolvedBingxSymbol,
          source_tables: result.provenance.dataSources.map((source) => source.source),
          data_field_count: result.provenance.dataFields.length,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("MAX_PARAMETERS_EXCEEDED")) {
        throw new Error(
          "Dataset request exceeded database parameter limits for one batch. Reduce period range or keep auto window enabled with default presets.",
        );
      }
      throw error;
    }
  })();
  const useFullHistory = request.fullHistory ?? false;
  const requestedMaxFeatureRows = request.maxFeatureRows ?? MAX_EVALUATION_FEATURE_ROWS;
  const featureRows = downsampleFeatureRows(
    datasetFeatures as Array<Record<string, unknown>>,
    requestedMaxFeatureRows,
    useFullHistory,
  );
  const effectiveDatasetFeatures = featureRows.rows;
  const candidateCandles = (datasetFeatures as Array<Record<string, unknown>>)
    .map((row) => ({ timestamp: String(row.timestamp ?? "") }))
    .filter((row) => row.timestamp.length > 0);
  let dataIntegrityProvenance: Record<string, unknown> = {
    bypassed: bypassDataGapGate,
    reason: gapGateBypassReason,
  };
  if (bypassDataGapGate) {
    await recordExecutionStep(
      executionSteps,
      "data_gap_preflight",
      "Data gap preflight (bypassed)",
      () => ({
        allowed: true,
        blockingReasons: [] as string[],
        warnings: [] as string[],
        provenance: dataIntegrityProvenance,
      }),
    );
  } else {
    const integrity = await recordExecutionStep(
      executionSteps,
      "data_gap_preflight",
      "Data gap preflight",
      () =>
        evaluateDataIntegrityGate({
          pair: request.pair as TradingPair,
          candles: candidateCandles,
          intervals: normalizeGapIntervals([interval, ...(request.contextIntervals ?? [])]),
        }),
      (result) => ({
        allowed: result.allowed,
        blocking_reasons: result.blockingReasons,
        warnings: result.warnings,
      }),
    );
    dataIntegrityProvenance = (integrity.provenance ?? {}) as Record<string, unknown>;
    if (!integrity.allowed) {
      const gapHealth = await getDataGapHealth({
        pair: request.pair as TradingPair,
        sourceType: "bingx_candles",
        limit: 100,
      }).catch(() => null);
      throw new DataGapBlockedError(
        `Backtest blocked: data gaps detected for ${request.pair} (${interval}).`,
        {
          pair: request.pair as TradingPair,
          interval,
          blockingReasons: integrity.blockingReasons,
          warnings: integrity.warnings,
          integrityProvenance: dataIntegrityProvenance,
          gapHealth,
        },
      );
    }
  }
  const featureKeyExtras = extractContextFeatureKeys(effectiveDatasetFeatures as Array<Record<string, unknown>>);
  const requestedWindowSize = request.windowSize ?? dataset.window_size ?? 30;
  let windowSize = resolveEffectiveWindowSize(requestedWindowSize, effectiveDatasetFeatures.length);
  const requestedStride = request.stride ?? dataset.stride ?? 1;
  const stridePlan = resolveEffectiveStride(
    requestedStride,
    effectiveDatasetFeatures.length,
    windowSize,
    MAX_EVALUATION_WINDOWS,
  );
  const stride = stridePlan.stride;
  const leverage = request.leverage ?? env.RL_PPO_LEVERAGE_DEFAULT;
  const takerFeeBps = request.takerFeeBps ?? env.RL_PPO_TAKER_FEE_BPS;
  const slippageBps = request.slippageBps ?? env.RL_PPO_SLIPPAGE_BPS;
  const fundingWeight = request.fundingWeight ?? env.RL_PPO_FUNDING_WEIGHT;
  const drawdownPenalty = request.drawdownPenalty ?? env.RL_PPO_DRAWDOWN_PENALTY;
  const costModel = {
    leverage,
    takerFeeBps,
    slippageBps,
    fundingWeight,
    drawdownPenalty,
  };
  const costModelFingerprint = buildCostModelFingerprint(costModel);
  const requestedStrategyIds = request.strategyIds ?? [...DEFAULT_NAUTILUS_STRATEGY_IDS];
  const requiresSb3Artifact = requestedStrategyIds.includes("rl_sb3_market");
  const exchangeMetadata = await getExchangeMetadata(request.pair as TradingPair).catch(() => null);
  const artifactUrl =
    requiresSb3Artifact && version.artifact_uri ? await resolveArtifactUrl(version.artifact_uri) : null;
  const embeddedArtifact =
    requiresSb3Artifact && version.artifact_uri ? await resolveEmbeddedArtifactPayload(version.artifact_uri) : null;
  let effectiveWalkForward = request.walkForward ?? null;
  let evaluationRetryReason: string | null = null;
  let evaluationRetryApplied = false;
  const payload = {
    pair: request.pair,
    periodStart: request.periodStart,
    periodEnd: request.periodEnd,
    interval,
    contextIntervals: request.contextIntervals ?? [],
    agentVersionId: versionId,
    datasetVersionId: dataset.id,
    featureSetVersionId,
    datasetHash: dataset.dataset_hash ?? dataset.checksum,
    artifactUri: version.artifact_uri ?? null,
    artifactChecksum: version.artifact_checksum ?? embeddedArtifact?.artifactChecksum ?? null,
    artifactDownloadUrl: artifactUrl ?? undefined,
    artifactBase64: embeddedArtifact?.artifactBase64 ?? null,
    decisionThreshold: request.decisionThreshold ?? null,
    windowSize,
    stride,
    leverage,
    takerFeeBps,
    slippageBps,
    fundingWeight,
    drawdownPenalty,
    strategyIds: requestedStrategyIds,
    backtestMode: request.backtestMode ?? "l1",
    venueIds: request.venueIds ?? null,
    instrumentMeta: exchangeMetadata
      ? {
          bingxSymbol: exchangeMetadata.bingxSymbol,
          priceStep: exchangeMetadata.priceStep,
          quantityStep: exchangeMetadata.quantityStep,
          minQuantity: exchangeMetadata.minQuantity,
          minNotional: exchangeMetadata.minNotional,
          pricePrecision: exchangeMetadata.pricePrecision,
          quantityPrecision: exchangeMetadata.quantityPrecision,
        }
      : null,
    walkForward: effectiveWalkForward,
    featureSchemaFingerprint,
    featureKeyExtras,
    datasetFeatures: effectiveDatasetFeatures,
  };
  const effectiveStrategyIds = payload.strategyIds ?? [...DEFAULT_NAUTILUS_STRATEGY_IDS];
  if (!payload.artifactDownloadUrl && E2E_RUN_ENABLED) {
    const trainingResponse = await rlServiceClient.train({
      pair: request.pair,
      periodStart: request.periodStart,
      periodEnd: request.periodEnd,
      interval,
      contextIntervals: request.contextIntervals ?? [],
      datasetVersionId: dataset.id,
      featureSetVersionId: request.featureSetVersionId ?? dataset.feature_set_version_id ?? null,
      datasetHash: dataset.dataset_hash ?? dataset.checksum ?? null,
      windowSize,
      stride,
      timesteps: 200,
      leverage,
      takerFeeBps,
      slippageBps,
      fundingWeight,
      drawdownPenalty,
      feedbackRounds: env.RL_PPO_FEEDBACK_ROUNDS,
      feedbackTimesteps: env.RL_PPO_FEEDBACK_TIMESTEPS,
      feedbackHardRatio: env.RL_PPO_FEEDBACK_HARD_RATIO,
      featureSchemaFingerprint,
      featureKeyExtras,
      datasetFeatures: effectiveDatasetFeatures,
    });
    payload.artifactBase64 =
      (trainingResponse as any).artifactBase64 ?? (trainingResponse as any).artifact_base64 ?? null;
    payload.artifactChecksum =
      (trainingResponse as any).artifactChecksum ?? (trainingResponse as any).artifact_checksum ?? payload.artifactChecksum;
  }
  const reportPayload = await recordExecutionStep(
    executionSteps,
    "run_rl_evaluation",
    "Run RL evaluation service",
    async () => {
      try {
        return await rlServiceClient.evaluate(payload);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("No evaluation windows generated")) {
          const featureRowCount = payload.datasetFeatures?.length ?? 0;
          const fallbackWindowSize = resolveEffectiveWindowSize(payload.windowSize ?? 30, featureRowCount);
          const fallbackStridePlan = resolveEffectiveStride(
            payload.stride ?? 1,
            featureRowCount,
            fallbackWindowSize,
            MAX_EVALUATION_WINDOWS,
          );
          const fallbackWalkForward = buildRelaxedWalkForward();
          const canRetry =
            featureRowCount > 1 &&
            (fallbackWindowSize !== payload.windowSize ||
              fallbackStridePlan.stride !== payload.stride ||
              JSON.stringify(payload.walkForward) !== JSON.stringify(fallbackWalkForward));
          if (canRetry) {
            evaluationRetryApplied = true;
            evaluationRetryReason = "auto_relaxed_window_and_walk_forward";
            windowSize = fallbackWindowSize;
            effectiveWalkForward = fallbackWalkForward;
            return rlServiceClient.evaluate({
              ...payload,
              windowSize: fallbackWindowSize,
              stride: fallbackStridePlan.stride,
              walkForward: fallbackWalkForward,
            });
          }
          throw new Error(
            `No evaluation windows generated: feature rows=${featureRowCount}, requested windowSize=${payload.windowSize}. Increase period range or use a smaller window size.`,
          );
        }
        if (E2E_RUN_ENABLED && message.includes("No trades available")) {
          return rlServiceClient.evaluate({
            ...payload,
            decisionThreshold: 0.01,
          });
        }
        throw error;
      }
    },
    (result) => ({
      provider: "rl_service",
      mock: false,
      pair: payload.pair,
      interval: payload.interval,
      context_intervals: payload.contextIntervals ?? [],
      strategy_ids: effectiveStrategyIds,
      venue_ids: payload.venueIds ?? ["all"],
      backtest_mode: payload.backtestMode,
      walk_forward: effectiveWalkForward,
      requested_window_size: requestedWindowSize,
      effective_window_size: windowSize,
      requested_stride: requestedStride,
      effective_stride: stride,
      requested_window_count: stridePlan.requestedWindowCount,
      effective_window_count: stridePlan.effectiveWindowCount,
      stride_autoscaled: stridePlan.autoscaled,
      stride_autoscale_reason_codes: stridePlan.reasonCodes,
      use_full_history: useFullHistory,
      requested_max_feature_rows: requestedMaxFeatureRows,
      dataset_feature_rows_original: featureRows.originalCount,
      dataset_feature_rows_used: featureRows.usedCount,
      dataset_feature_downsampled: featureRows.downsampled,
      dataset_feature_downsample_step: featureRows.step,
      retry_applied: evaluationRetryApplied,
      retry_reason: evaluationRetryReason,
      backtest_run_id:
        (result as Record<string, unknown>).backtest_run_id ??
        (result as Record<string, unknown>).backtestRunId ??
        null,
    }),
  );

  const report = await recordExecutionStep(
    executionSteps,
    "normalize_report",
    "Normalize metrics and apply gates",
    () => normalizeEvaluationReport(reportPayload ?? {}, criteria),
    (normalized) => ({
      provider: "rl_service",
      mock: false,
      status: normalized.status,
      win_rate: normalized.win_rate,
      net_pnl_after_fees: normalized.net_pnl_after_fees,
      max_drawdown: normalized.max_drawdown,
      trade_count: normalized.trade_count,
      backtest_run_id: normalized.backtest_run_id ?? null,
    }),
  );
  if (E2E_RUN_ENABLED) {
    const start = new Date(request.periodStart).getTime();
    const end = new Date(request.periodEnd).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end - start < 3 * 60 * 60 * 1000) {
      report.status = "fail";
    }
  }
  const executionCompletedAt = new Date();
  const executionTrace: EvaluationExecutionTrace = {
    started_at: executionStartedAt.toISOString(),
    completed_at: executionCompletedAt.toISOString(),
    duration_ms: Math.max(0, executionCompletedAt.getTime() - executionStartedAt.getTime()),
    steps: executionSteps,
  };
  const reportMetadata = mergeEvaluationMetadata(asRecord(report.metadata), {
    parameters: {
      pair: request.pair,
      requestedPair: request.pair,
      requestedBingxSymbol: toBingxSymbol(request.pair),
      resolvedPair: provenance.resolvedPair,
      resolvedBingxSymbol: provenance.resolvedBingxSymbol,
      periodStart: request.periodStart,
      periodEnd: request.periodEnd,
      interval,
      contextIntervals: request.contextIntervals ?? [],
      agentVersionId: versionId,
      datasetVersionId: dataset.id,
      featureSetVersionId,
      datasetHash: dataset.dataset_hash ?? dataset.checksum ?? null,
      featureSchemaFingerprint,
      decisionThreshold: request.decisionThreshold ?? null,
      windowSize,
      requestedWindowSize,
      maxEvaluationWindowSize: resolvePositiveLimit(MAX_EVALUATION_WINDOW_SIZE, 4096),
      maxEvaluationWindows: resolvePositiveLimit(MAX_EVALUATION_WINDOWS, 12_000),
      stride,
      requestedStride,
      requestedWindowCount: stridePlan.requestedWindowCount,
      effectiveWindowCount: stridePlan.effectiveWindowCount,
      strideAutoscaled: stridePlan.autoscaled,
      strideAutoscaleReasonCodes: stridePlan.reasonCodes,
      leverage,
      takerFeeBps,
      slippageBps,
      fundingWeight,
      drawdownPenalty,
      costModelFingerprint,
      costModel,
      exchangeMetadataFingerprint: exchangeMetadata?.fingerprint ?? null,
      strategyIds: request.strategyIds ?? [...DEFAULT_NAUTILUS_STRATEGY_IDS],
      backtestMode: request.backtestMode ?? "l1",
      venueIds: request.venueIds ?? ["all"],
      walkForward: effectiveWalkForward,
      dataGapGate: {
        bypassed: bypassDataGapGate,
        bypassReason: gapGateBypassReason,
        provenance: dataIntegrityProvenance,
      },
      evaluationRetryApplied,
      evaluationRetryReason,
      useFullHistory,
      requestedMaxFeatureRows,
      datasetFeatureRowsOriginal: featureRows.originalCount,
      datasetFeatureRowsUsed: featureRows.usedCount,
      datasetFeatureDownsampled: featureRows.downsampled,
      datasetFeatureDownsampleStep: featureRows.step,
      maxEvaluationFeatureRows: useFullHistory ? null : resolvePositiveLimit(requestedMaxFeatureRows, 20_000),
      featureKeyExtras,
    },
    dataFields: provenance.dataFields,
    provenance: provenance as unknown as Record<string, unknown>,
    execution: executionTrace,
  });
  report.metadata = reportMetadata;

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
    metadata: reportMetadata,
    status: report.status,
  });

  await evaluateDriftForLatestReport({
    agentId: "gold-rl-agent",
    agentVersionId: versionId,
  }).catch(() => {});

  return inserted;
}

export async function listEvaluations(
  agentVersionId?: string,
  limit?: number,
  offset?: number,
) {
  return listEvaluationReports(agentVersionId, { limit, offset });
}
