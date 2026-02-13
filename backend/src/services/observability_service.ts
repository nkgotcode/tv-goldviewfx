import { loadEnv } from "../config/env";
import { insertObservabilityMetric } from "../db/repositories/observability_metrics";
import { insertOpsAlert } from "../db/repositories/ops_alerts";
import { insertDriftAlert } from "../db/repositories/drift_alerts";
import { getTradeDecision } from "../db/repositories/trade_decisions";

function severityFromThreshold(value: number, threshold: number) {
  if (value >= threshold * 2) return "high" as const;
  if (value >= threshold * 1.25) return "medium" as const;
  return "low" as const;
}

async function recordSloAlert(params: {
  metric: string;
  value: number;
  threshold: number;
  metadata?: Record<string, unknown>;
}) {
  return insertOpsAlert({
    category: "slo",
    severity: severityFromThreshold(params.value, params.threshold),
    metric: params.metric,
    value: params.value,
    threshold: params.threshold,
    metadata: params.metadata ?? {},
  });
}

export async function recordDecisionLatencyMetric(params: {
  runId: string;
  pair: string;
  mode?: string;
  latencyMs: number;
  warnings?: string[];
  traceId?: string | null;
}) {
  const env = loadEnv();
  await insertObservabilityMetric({
    name: "decision_latency_ms",
    value: params.latencyMs,
    unit: "ms",
    tags: {
      run_id: params.runId,
      pair: params.pair,
      mode: params.mode ?? "unknown",
      trace_id: params.traceId ?? "",
    },
    metadata: { warnings: params.warnings ?? [] },
  });
  if (params.latencyMs > env.DECISION_LATENCY_SLO_MS) {
    await recordSloAlert({
      metric: "decision_latency_ms",
      value: params.latencyMs,
      threshold: env.DECISION_LATENCY_SLO_MS,
      metadata: { run_id: params.runId, pair: params.pair, trace_id: params.traceId ?? null },
    });
  }
}

export async function recordIngestionLagMetric(params: {
  pair: string;
  sourceType: string;
  lagSeconds: number;
  thresholdSeconds?: number;
}) {
  const env = loadEnv();
  const threshold = params.thresholdSeconds ?? env.INGESTION_LAG_SLO_SEC;
  await insertObservabilityMetric({
    name: "ingestion_lag_seconds",
    value: params.lagSeconds,
    unit: "seconds",
    tags: {
      pair: params.pair,
      source_type: params.sourceType,
    },
  });
  if (params.lagSeconds > threshold) {
    await recordSloAlert({
      metric: "ingestion_lag_seconds",
      value: params.lagSeconds,
      threshold,
      metadata: { pair: params.pair, source_type: params.sourceType },
    });
  }
}

export async function recordSlippageMetric(params: {
  tradeId: string;
  executionId: string;
  referencePrice: number;
  averagePrice: number;
  traceId?: string | null;
}) {
  const env = loadEnv();
  if (params.referencePrice <= 0) return;
  const slippage = params.averagePrice - params.referencePrice;
  const slippageBps = (slippage / params.referencePrice) * 10_000;
  await insertObservabilityMetric({
    name: "slippage_bps",
    value: slippageBps,
    unit: "bps",
    tags: {
      trade_id: params.tradeId,
      execution_id: params.executionId,
      trace_id: params.traceId ?? "",
    },
    metadata: { reference_price: params.referencePrice, average_price: params.averagePrice },
  });
  if (Math.abs(slippageBps) > env.SLIPPAGE_SLO_BPS) {
    await recordSloAlert({
      metric: "slippage_bps",
      value: Math.abs(slippageBps),
      threshold: env.SLIPPAGE_SLO_BPS,
      metadata: { trade_id: params.tradeId, execution_id: params.executionId, trace_id: params.traceId ?? null },
    });
  }
}

export async function recordExecutionSlippage(params: {
  tradeId: string;
  executionId: string;
  tradeDecisionId?: string | null;
  averagePrice: number;
  traceId?: string | null;
}) {
  if (!params.tradeDecisionId) return;
  const decision = await getTradeDecision(params.tradeDecisionId);
  const referencePrice = Number(decision.reference_price ?? 0);
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) return;
  if (!Number.isFinite(params.averagePrice) || params.averagePrice <= 0) return;
  await recordSlippageMetric({
    tradeId: params.tradeId,
    executionId: params.executionId,
    referencePrice,
    averagePrice: params.averagePrice,
    traceId: params.traceId ?? decision.trace_id ?? null,
  });
}

export async function recordDecisionConfidenceMetric(params: {
  runId: string;
  confidenceScore: number;
  traceId?: string | null;
}) {
  const env = loadEnv();
  await insertObservabilityMetric({
    name: "decision_confidence",
    value: params.confidenceScore,
    unit: "score",
    tags: { run_id: params.runId, trace_id: params.traceId ?? "" },
  });

  const delta = Math.abs(params.confidenceScore - env.DRIFT_CONFIDENCE_BASELINE);
  if (delta > env.DRIFT_CONFIDENCE_DELTA) {
    await insertDriftAlert({
      agent_id: params.runId,
      metric: "decision_confidence",
      baseline_value: env.DRIFT_CONFIDENCE_BASELINE,
      current_value: params.confidenceScore,
      status: "open",
    });
    await insertOpsAlert({
      category: "drift",
      severity: "medium",
      metric: "decision_confidence",
      value: params.confidenceScore,
      threshold: env.DRIFT_CONFIDENCE_BASELINE,
      metadata: { run_id: params.runId, delta },
    });
  }
}
