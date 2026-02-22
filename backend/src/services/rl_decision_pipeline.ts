import { insertMarketInputSnapshot } from "../db/repositories/market_input_snapshots";
import { insertTradeDecision } from "../db/repositories/trade_decisions";
import { insertTrade, listTradesByStatuses, updateTradeMetrics } from "../db/repositories/trades";
import { insertTradeExecution } from "../db/repositories/trade_executions";
import { getAgentConfig } from "../db/repositories/agent_config";
import { getAgentVersion } from "../db/repositories/agent_versions";
import { getDatasetVersion } from "../db/repositories/dataset_versions";
import { rlServiceClient } from "../rl/client";
import type { InferenceRequest, InferenceResponse, TradeAction } from "../types/rl";
import { loadEnv } from "../config/env";
import { loadRlServiceConfig } from "../config/rl_service";
import { evaluateRiskLimits, fetchRiskLimitSet } from "./risk_limits_service";
import { getRun, pauseAgentRun } from "./rl_agent_service";
import { auditRlEvent } from "./rl_audit";
import { executeTrade } from "./trade_execution";
import { transitionTradeStatus } from "./trade_state_machine";
import { evaluateDataSourceGate } from "./data_source_status_service";
import { evaluateDataIntegrityGate } from "./data_integrity_service";
import { recordDecisionLatency, recordFeatureQuality } from "./rl_metrics";
import { recordDecisionConfidenceMetric } from "./observability_service";
import { applySourceGates } from "./source_gating_service";
import { loadFeatureInputs } from "../rl/data_loader";
import { getFeatureSchemaFingerprint, getFeatureSetConfigById } from "./feature_set_service";
import { resolveArtifactUrl } from "./model_artifact_service";
import { isInstrumentAllowed } from "./instrument_policy";
import { evaluateFeatureQualityGate } from "./feature_quality_gate";

const VOLATILITY_SPIKE_THRESHOLD = 0.05;
const E2E_RUN_ENABLED = ["1", "true", "yes", "on"].includes((process.env.E2E_RUN ?? "").trim().toLowerCase());

export type DecisionRequest = {
  runId: string;
  market: InferenceRequest["market"];
  ideas?: InferenceRequest["ideas"];
  signals?: InferenceRequest["signals"];
  news?: InferenceRequest["news"];
  ocr?: InferenceRequest["ocr"];
  recentTrades?: InferenceRequest["recentTrades"];
  simulateExecutionStatus?: "partial" | "filled" | "failed";
};

export type DecisionResult = {
  decision: InferenceResponse["decision"];
  tradeDecisionId: string;
  tradeId?: string;
  tradeExecutionStatus?: string;
  warnings: string[];
};

function computePriceChange(candles: InferenceRequest["market"]["candles"]) {
  if (!candles || candles.length < 2) return 0;
  const first = candles[0].close;
  const last = candles[candles.length - 1].close;
  if (!first) return 0;
  return (last - first) / first;
}

function hasConflictingSignals(signals: Array<{ score: number }> = []) {
  const hasPositive = signals.some((signal) => signal.score > 0);
  const hasNegative = signals.some((signal) => signal.score < 0);
  return hasPositive && hasNegative;
}

function normalizeInference(payload: any): InferenceResponse {
  const decision = payload?.decision ?? {};
  return {
    decision: {
      action: decision.action,
      confidenceScore: decision.confidenceScore ?? decision.confidence_score ?? 0,
      size: decision.size ?? null,
      reason: decision.reason ?? null,
      riskCheckResult: decision.riskCheckResult ?? decision.risk_check_result ?? "pass",
      policyVersion: decision.policyVersion ?? decision.policy_version ?? null,
    },
    features: payload?.features ?? {},
    warnings: payload?.warnings ?? [],
    modelVersion: payload?.modelVersion ?? payload?.model_version ?? null,
  };
}

function mockInference(payload: InferenceRequest): InferenceResponse {
  const scores = [
    ...(payload.ideas ?? []),
    ...(payload.signals ?? []),
    ...(payload.news ?? []),
    ...(payload.ocr ?? []),
  ].map((signal) => signal.score * (signal.confidence ?? 1));

  const auxScore = scores.reduce((sum, value) => sum + value, 0);
  const priceChange = computePriceChange(payload.market.candles ?? []);
  const score = auxScore + priceChange * 0.5;

  let action: TradeAction = "hold";
  if (score >= 0.2) action = "long";
  if (score <= -0.2) action = "short";

  return normalizeInference({
    decision: {
      action,
      confidenceScore: Math.min(1, Math.abs(score)),
      size: payload.riskLimits?.maxPositionSize,
      reason: "mock-inference",
      riskCheckResult: "pass",
    },
    features: {
      aux_score: auxScore,
      price_change: priceChange,
    },
    warnings: ["rl_service_mock"],
    modelVersion: payload.policyVersion ?? null,
  });
}

export function mapInferenceToDecision(
  inference: InferenceResponse,
  riskAllowed: boolean,
): InferenceResponse["decision"] {
  if (riskAllowed) {
    return inference.decision;
  }
  return {
    ...inference.decision,
    action: "hold",
    riskCheckResult: "fail",
    reason: inference.decision.reason ?? "risk_limits_breached",
  };
}

async function countOpenPositions(pair: string, runId?: string | null, startedAt?: string | null) {
  const trades = await listTradesByStatuses(["placed", "filled"]);
  return trades.filter((trade) => {
    if (trade.instrument !== pair) return false;
    if (trade.closed_at) return false;
    if (runId) {
      return trade.agent_run_id === runId;
    }
    if (E2E_RUN_ENABLED && startedAt) {
      return new Date(trade.created_at ?? 0).getTime() >= new Date(startedAt).getTime();
    }
    return true;
  }).length;
}

export async function runDecisionPipeline(request: DecisionRequest): Promise<DecisionResult> {
  const decisionStart = Date.now();
  const run = await getRun(request.runId);
  if (run.status !== "running") {
    throw new Error("Run is not active");
  }
  const config = await getAgentConfig();
  if (!isInstrumentAllowed(run.pair, config.allowed_instruments ?? [])) {
    await pauseAgentRun(run.id);
    throw new Error(`Instrument ${run.pair} is not allowed by agent configuration.`);
  }
  const env = loadEnv();
  const simulationFlag = (process.env.ALLOW_LIVE_SIMULATION ?? "").toLowerCase();
  const allowSimulation = process.env.NODE_ENV === "test" || ["1", "true", "yes", "on"].includes(simulationFlag);
  const bypassSourceGate = allowSimulation && Boolean(request.simulateExecutionStatus);
  const bypassIntegrityGate = allowSimulation && Boolean(request.simulateExecutionStatus);
  const traceId = crypto.randomUUID();

  const agentVersion = await getAgentVersion(run.agent_version_id);
  const datasetVersion = run.dataset_version_id ? await getDatasetVersion(run.dataset_version_id) : null;
  const datasetHash = datasetVersion?.dataset_hash ?? datasetVersion?.checksum ?? null;
  const featureSetVersionId = run.feature_set_version_id ?? datasetVersion?.feature_set_version_id ?? null;
  const artifactUri = agentVersion.artifact_uri ?? null;
  const artifactChecksum = agentVersion.artifact_checksum ?? null;
  const artifactDownloadUrl = artifactUri ? await resolveArtifactUrl(artifactUri) : null;

  const riskLimitSet = await fetchRiskLimitSet(run.risk_limit_set_id);

  const sourceGate = await evaluateDataSourceGate(run.pair);
  const integrityGate = await evaluateDataIntegrityGate({
    pair: run.pair,
    candles: request.market.candles,
  });
  const warnings: string[] = [
    ...sourceGate.warnings,
    ...integrityGate.warnings,
    ...integrityGate.blockingReasons.map((reason) => `data_integrity:${reason}`),
  ];

  const featureConfig = await getFeatureSetConfigById(featureSetVersionId ?? null);
  const featureSchemaFingerprint = getFeatureSchemaFingerprint(featureConfig);
  const windowStart = request.market.candles?.[0]?.timestamp;
  const windowEnd = request.market.candles?.[request.market.candles.length - 1]?.timestamp;
  const loadedInputs =
    windowStart && windowEnd && (featureConfig.includeNews || featureConfig.includeOcr)
      ? await loadFeatureInputs({
          start: windowStart,
          end: windowEnd,
          includeNews: featureConfig.includeNews,
          includeOcr: featureConfig.includeOcr,
        })
      : { news: [], ocr: [] };

  const disabledSources = new Set(sourceGate.disabledSources);
  const ideas = disabledSources.has("ideas") ? [] : request.ideas ?? [];
  const signals = disabledSources.has("signals") ? [] : request.signals ?? [];
  const news = disabledSources.has("news") ? [] : featureConfig.includeNews ? (request.news ?? loadedInputs.news) : [];
  const ocr = disabledSources.has("ocr_text") ? [] : featureConfig.includeOcr ? (request.ocr ?? loadedInputs.ocr) : [];
  const recentTrades = disabledSources.has("trades") ? [] : request.recentTrades ?? [];

  const minConfidenceScore = config.min_confidence_score ?? null;
  const allowedSourceIds = config.allowed_source_ids ?? null;

  const [ideaGate, signalGate, newsGate, ocrGate] = await Promise.all([
    applySourceGates({ signals: ideas, label: "ideas", minConfidenceScore, allowedSourceIds }),
    applySourceGates({ signals, label: "signals", minConfidenceScore, allowedSourceIds }),
    applySourceGates({ signals: news, label: "news", minConfidenceScore, allowedSourceIds }),
    applySourceGates({ signals: ocr, label: "ocr_text", minConfidenceScore, allowedSourceIds }),
  ]);

  warnings.push(...ideaGate.warnings, ...signalGate.warnings, ...newsGate.warnings, ...ocrGate.warnings);

  const marketPayload = {
    pair: run.pair,
    candles: request.market.candles,
    lastPrice: request.market.lastPrice,
    spread: request.market.spread,
  };

  const inferencePayload: InferenceRequest = {
    runId: run.id,
    pair: run.pair,
    market: marketPayload,
    ideas: ideaGate.allowed,
    signals: signalGate.allowed,
    news: newsGate.allowed,
    ocr: ocrGate.allowed,
    recentTrades,
    riskLimits: {
      maxPositionSize: Number(riskLimitSet.max_position_size),
      leverageCap: Number(riskLimitSet.leverage_cap),
      maxDailyLoss: Number(riskLimitSet.max_daily_loss),
      maxDrawdown: Number(riskLimitSet.max_drawdown),
      maxOpenPositions: Number(riskLimitSet.max_open_positions),
    },
    learningEnabled: run.learning_enabled,
    learningWindowMinutes: run.learning_window_minutes ?? undefined,
    policyVersion: agentVersion.id,
    artifactUri: artifactUri ?? undefined,
    artifactChecksum: artifactChecksum ?? undefined,
    artifactDownloadUrl: artifactDownloadUrl ?? undefined,
    featureSchemaFingerprint,
  };

  let forcedHoldReason: string | null = null;
  const setForcedHoldReason = (reason: string) => {
    if (!forcedHoldReason) {
      forcedHoldReason = reason;
    }
  };
  if (run.mode === "live" && config.kill_switch && !E2E_RUN_ENABLED) {
    warnings.push("kill_switch_enabled");
    setForcedHoldReason(config.kill_switch_reason ?? "kill_switch_enabled");
    auditRlEvent("kill_switch_block", { run_id: run.id, reason: forcedHoldReason });
  }

  if (env.RL_ENFORCE_PROVENANCE && run.mode === "live") {
    if (!datasetVersion || !datasetHash) {
      warnings.push("provenance_dataset_missing");
      setForcedHoldReason("provenance_dataset_missing");
    }
    if (!featureSetVersionId) {
      warnings.push("provenance_feature_set_missing");
      setForcedHoldReason("provenance_feature_set_missing");
    }
    if (!artifactUri || !artifactChecksum) {
      warnings.push("provenance_artifact_missing");
      setForcedHoldReason("provenance_artifact_missing");
    } else if (!artifactDownloadUrl) {
      warnings.push("provenance_artifact_unavailable");
      setForcedHoldReason("provenance_artifact_unavailable");
    }
    if (forcedHoldReason) {
      await pauseAgentRun(run.id);
    }
  }
  if (!sourceGate.allowed) {
    if (!bypassSourceGate) {
      setForcedHoldReason("data_source_unavailable");
      await pauseAgentRun(run.id);
    }
  }
  if (!integrityGate.allowed) {
    if (!bypassIntegrityGate) {
      setForcedHoldReason("data_integrity_block");
      await pauseAgentRun(run.id);
    }
  }

  if (!request.market.candles || request.market.candles.length === 0) {
    warnings.push("exchange_maintenance");
    setForcedHoldReason("exchange_maintenance");
    await pauseAgentRun(run.id);
  }

  const priceChange = Math.abs(computePriceChange(request.market.candles));
  if (priceChange >= VOLATILITY_SPIKE_THRESHOLD) {
    warnings.push("volatility_spike");
    await pauseAgentRun(run.id);
  }

  if (hasConflictingSignals([...(request.ideas ?? []), ...(request.signals ?? []), ...(request.news ?? [])])) {
    warnings.push("conflicting_signals");
  }

  const rlConfig = loadRlServiceConfig();
  if (run.mode === "live" && rlConfig.mock && !E2E_RUN_ENABLED) {
    warnings.push("rl_service_mock_enabled");
    setForcedHoldReason("rl_service_mock_enabled");
    await pauseAgentRun(run.id);
  }

  const rawInference = rlConfig.mock ? mockInference(inferencePayload) : await rlServiceClient.infer(inferencePayload);
  const inference = normalizeInference(rawInference);
  if (inference.warnings.length > 0) {
    warnings.push(...inference.warnings);
  }
  if (
    run.mode === "live" &&
    !E2E_RUN_ENABLED &&
    inference.warnings.some((warning) => warning === "model_unavailable" || warning.startsWith("model_inference_failed"))
  ) {
    setForcedHoldReason("model_inference_unavailable");
    await pauseAgentRun(run.id);
  }

  const featureQuality = evaluateFeatureQualityGate({
    features: inference.features ?? {},
    candles: request.market.candles ?? [],
    criticalFields:
      featureConfig.technical?.enabled && featureConfig.technical.criticalFields
        ? featureConfig.technical.criticalFields
        : ["last_price", "price_change"],
  });
  recordFeatureQuality({
    runId: run.id,
    pair: run.pair,
    missingCount: featureQuality.missingCount,
    oodScore: featureQuality.oodScore,
    freshnessSeconds: featureQuality.freshnessSeconds,
    traceId,
  });
  if (!featureQuality.allowed && run.mode === "live" && !E2E_RUN_ENABLED) {
    warnings.push(
      "feature_quality_gate",
      ...featureQuality.missingFields.map((field) => `feature_missing:${field}`),
      featureQuality.reason ? `feature_gate_reason:${featureQuality.reason}` : "feature_gate_reason:unknown",
    );
    setForcedHoldReason(featureQuality.reason ?? "feature_quality_gate");
    await pauseAgentRun(run.id);
  }

  recordDecisionConfidenceMetric({
    runId: run.id,
    confidenceScore: inference.decision.confidenceScore,
    traceId,
  }).catch(() => {});

  const openPositions = await countOpenPositions(run.pair, run.id, run.started_at ?? null);
  const riskEvaluation = evaluateRiskLimits(riskLimitSet, {
    positionSize: inference.decision.size ?? riskLimitSet.max_position_size,
    leverage: riskLimitSet.leverage_cap,
    openPositions,
  });

  let decision = mapInferenceToDecision(inference, riskEvaluation.allowed);
  if (forcedHoldReason) {
    decision = {
      ...decision,
      action: "hold",
      riskCheckResult: "fail",
      reason: forcedHoldReason,
      confidenceScore: 0,
    };
  }
  if (!riskEvaluation.allowed) {
    warnings.push("risk_limits_breached");
    await pauseAgentRun(run.id);
  }

  const snapshot = await insertMarketInputSnapshot({
    pair: run.pair,
    captured_at: new Date().toISOString(),
    dataset_version_id: datasetVersion?.id ?? null,
    dataset_hash: datasetHash,
    feature_set_version_id: featureSetVersionId ?? null,
    agent_version_id: agentVersion.id,
    artifact_uri: artifactUri,
    market_features_ref: `market:${Date.now()}`,
    metadata: {
      window_start: windowStart ?? null,
      window_end: windowEnd ?? null,
      input_counts: {
        ideas: ideas.length,
        signals: signals.length,
        news: news.length,
        ocr: ocr.length,
        recent_trades: recentTrades.length,
        candles: request.market.candles?.length ?? 0,
      },
      feature_flags: {
        include_news: featureConfig.includeNews,
        include_ocr: featureConfig.includeOcr,
      },
      source_gate: {
        allowed: sourceGate.allowed,
        blocking_sources: sourceGate.blockingSources,
        disabled_sources: sourceGate.disabledSources,
        warnings: sourceGate.warnings,
      },
      data_integrity_gate: {
        allowed: integrityGate.allowed,
        blocking_reasons: integrityGate.blockingReasons,
        warnings: integrityGate.warnings,
        provenance: integrityGate.provenance,
      },
      feature_quality_gate: {
        allowed: featureQuality.allowed,
        reason: featureQuality.reason ?? null,
        missing_fields: featureQuality.missingFields,
        missing_count: featureQuality.missingCount,
        ood_score: featureQuality.oodScore,
        freshness_seconds: featureQuality.freshnessSeconds,
      },
      provenance: {
        dataset_version_id: datasetVersion?.id ?? null,
        dataset_hash: datasetHash,
        feature_set_version_id: featureSetVersionId ?? null,
        agent_version_id: agentVersion.id,
        artifact_uri: artifactUri,
      },
      trace_id: traceId,
    },
  });

  const tradeDecision = await insertTradeDecision({
    agent_run_id: run.id,
    pair: run.pair,
    decided_at: new Date().toISOString(),
    action: decision.action,
    confidence_score: decision.confidenceScore,
    inputs_snapshot_id: snapshot.id,
    policy_version_label: decision.policyVersion ?? null,
    risk_check_result: decision.riskCheckResult,
    reason: decision.reason ?? null,
    reference_price: request.market.lastPrice ?? null,
    trace_id: traceId,
  });

  auditRlEvent("decision", {
    run_id: run.id,
    trade_decision_id: tradeDecision.id,
    action: decision.action,
  });

  const finalize = (result: DecisionResult) => {
    recordDecisionLatency({
      runId: run.id,
      pair: run.pair,
      mode: run.mode,
      latencyMs: Date.now() - decisionStart,
      warnings: result.warnings,
      traceId,
    });
    return result;
  };

  if (decision.action !== "long" && decision.action !== "short") {
    return finalize({
      decision,
      tradeDecisionId: tradeDecision.id,
      warnings,
    });
  }

  if (decision.riskCheckResult === "fail") {
    return finalize({
      decision,
      tradeDecisionId: tradeDecision.id,
      warnings,
    });
  }

  const quantity = decision.size ?? riskLimitSet.max_position_size;
  const trade = await insertTrade({
    signal_id: null,
    agent_config_id: null,
    agent_run_id: run.id,
    instrument: run.pair,
    side: decision.action,
    quantity,
    status: "placed",
    mode: run.mode,
    client_order_id: `gvfx-rl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });

  let tradeExecutionStatus: string | undefined;
  if (allowSimulation && request.simulateExecutionStatus) {
    tradeExecutionStatus = request.simulateExecutionStatus;
    const filledQuantity = request.simulateExecutionStatus === "partial" ? quantity / 2 : quantity;
    await insertTradeExecution({
      trade_id: trade.id,
      trade_decision_id: tradeDecision.id,
      execution_kind: "entry",
      exchange_order_id: `sim-${Date.now()}`,
      idempotency_key: `decision:${tradeDecision.id}`,
      trace_id: traceId,
      execution_mode: trade.mode,
      requested_instrument: trade.instrument,
      requested_side: trade.side,
      requested_quantity: trade.quantity,
      filled_quantity: filledQuantity,
      average_price: 0,
      status: request.simulateExecutionStatus,
      attempt_count: 0,
      last_attempt_at: null,
    });

    if (request.simulateExecutionStatus === "filled") {
      await transitionTradeStatus(trade.id, "filled", { reason: "simulation" });
      await updateTradeMetrics(trade.id, { position_size: filledQuantity });
    }
    if (request.simulateExecutionStatus === "failed") {
      await transitionTradeStatus(trade.id, "rejected", { reason: "simulation" });
    }
    if (request.simulateExecutionStatus === "partial") {
      await transitionTradeStatus(trade.id, "partial", { reason: "simulation" });
    }
  } else {
    try {
      const execution = await executeTrade({
        id: trade.id,
        trade_decision_id: tradeDecision.id,
        instrument: trade.instrument,
        side: trade.side,
        quantity: trade.quantity,
        mode: trade.mode,
        client_order_id: trade.client_order_id ?? null,
        tp_price: trade.tp_price ?? null,
        sl_price: trade.sl_price ?? null,
        idempotency_key: `decision:${tradeDecision.id}`,
        trace_id: traceId,
      });
      tradeExecutionStatus = execution.status;
      if (execution.status === "filled") {
        await transitionTradeStatus(trade.id, "filled");
      } else if (execution.status === "failed") {
        await transitionTradeStatus(trade.id, "rejected");
      } else if (execution.status === "partial") {
        await transitionTradeStatus(trade.id, "partial");
      }
    } catch (error) {
      tradeExecutionStatus = "failed";
      warnings.push("execution_failed");
      await transitionTradeStatus(trade.id, "rejected", {
        reason: error instanceof Error ? error.message : "execution_failed",
      });
    }
  }

  auditRlEvent("trade_execution", {
    run_id: run.id,
    trade_decision_id: tradeDecision.id,
    trade_id: trade.id,
    status: tradeExecutionStatus,
  });

  return finalize({
    decision,
    tradeDecisionId: tradeDecision.id,
    tradeId: trade.id,
    tradeExecutionStatus,
    warnings,
  });
}
