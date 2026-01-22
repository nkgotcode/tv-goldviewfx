import { supabase } from "../db/client";
import { insertMarketInputSnapshot } from "../db/repositories/market_input_snapshots";
import { insertTradeDecision } from "../db/repositories/trade_decisions";
import { insertTrade, updateTradeStatus, updateTradeMetrics } from "../db/repositories/trades";
import { insertTradeExecution } from "../db/repositories/trade_executions";
import { getAgentConfig } from "../db/repositories/agent_config";
import { rlServiceClient } from "../rl/client";
import type { InferenceRequest, InferenceResponse, TradeAction } from "../types/rl";
import { loadRlServiceConfig } from "../config/rl_service";
import { evaluateRiskLimits, fetchRiskLimitSet } from "./risk_limits_service";
import { getRun, pauseAgentRun } from "./rl_agent_service";
import { auditRlEvent } from "./rl_audit";
import { executeTrade } from "./trade_execution";
import { evaluateDataSourceGate } from "./data_source_status_service";
import { recordDecisionLatency } from "./rl_metrics";
import { applySourceGates } from "./source_gating_service";
import { loadFeatureInputs } from "../rl/data_loader";
import { getFeatureSetConfigById } from "./feature_set_service";

const VOLATILITY_SPIKE_THRESHOLD = 0.05;

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

async function countOpenPositions(pair: string) {
  const result = await supabase
    .from("trades")
    .select("id", { count: "exact", head: true })
    .eq("instrument", pair)
    .in("status", ["placed", "filled"]);
  if (result.error) {
    return 0;
  }
  return result.count ?? 0;
}

export async function runDecisionPipeline(request: DecisionRequest): Promise<DecisionResult> {
  const decisionStart = Date.now();
  const run = await getRun(request.runId);
  if (run.status !== "running") {
    throw new Error("Run is not active");
  }
  const simulationFlag = (process.env.ALLOW_LIVE_SIMULATION ?? "").toLowerCase();
  const allowSimulation = process.env.NODE_ENV === "test" || ["1", "true", "yes", "on"].includes(simulationFlag);
  const bypassSourceGate = allowSimulation && Boolean(request.simulateExecutionStatus);

  const riskLimitSet = await fetchRiskLimitSet(run.risk_limit_set_id);

  const sourceGate = await evaluateDataSourceGate(run.pair);
  const warnings: string[] = [...sourceGate.warnings];

  const featureConfig = await getFeatureSetConfigById(run.feature_set_version_id ?? null);
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

  const agentConfig = await getAgentConfig();
  const minConfidenceScore = agentConfig.min_confidence_score ?? null;
  const allowedSourceIds = agentConfig.allowed_source_ids ?? null;

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
  };

  let forcedHoldReason: string | null = null;
  if (run.mode === "live" && agentConfig.kill_switch) {
    warnings.push("kill_switch_enabled");
    forcedHoldReason = agentConfig.kill_switch_reason ?? "kill_switch_enabled";
    auditRlEvent("kill_switch_block", { run_id: run.id, reason: forcedHoldReason });
  }
  if (!sourceGate.allowed) {
    if (!bypassSourceGate) {
      forcedHoldReason = "data_source_unavailable";
      await pauseAgentRun(run.id);
    }
  }

  if (!request.market.candles || request.market.candles.length === 0) {
    warnings.push("exchange_maintenance");
    forcedHoldReason = "exchange_maintenance";
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
  const rawInference = rlConfig.mock ? mockInference(inferencePayload) : await rlServiceClient.infer(inferencePayload);
  const inference = normalizeInference(rawInference);

  const openPositions = await countOpenPositions(run.pair);
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
    market_features_ref: `market:${Date.now()}`,
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
      exchange_order_id: `sim-${Date.now()}`,
      filled_quantity: filledQuantity,
      average_price: 0,
      status: request.simulateExecutionStatus,
    });

    if (request.simulateExecutionStatus === "filled") {
      await updateTradeStatus(trade.id, "filled");
      await updateTradeMetrics(trade.id, { position_size: filledQuantity });
    }
    if (request.simulateExecutionStatus === "failed") {
      await updateTradeStatus(trade.id, "rejected");
    }
  } else {
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
    });
    tradeExecutionStatus = execution.status;
    if (execution.status === "filled") {
      await updateTradeStatus(trade.id, "filled");
    } else if (execution.status === "failed") {
      await updateTradeStatus(trade.id, "rejected");
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
