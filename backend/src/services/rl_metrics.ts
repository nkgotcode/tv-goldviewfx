import { logInfo } from "./logger";
import { recordDecisionLatencyMetric, recordFeatureQualityMetrics } from "./observability_service";

export function recordDecisionLatency(params: {
  runId: string;
  pair: string;
  mode?: string;
  latencyMs: number;
  warnings?: string[];
  traceId?: string | null;
}) {
  logInfo("rl.metrics.decision_latency", {
    run_id: params.runId,
    pair: params.pair,
    mode: params.mode ?? "unknown",
    latency_ms: params.latencyMs,
    warnings: params.warnings ?? [],
  });
  recordDecisionLatencyMetric({
    runId: params.runId,
    pair: params.pair,
    mode: params.mode,
    latencyMs: params.latencyMs,
    warnings: params.warnings,
    traceId: params.traceId ?? null,
  }).catch(() => {});
}

export function recordLearningWindow(params: {
  agentVersionId: string;
  pair: string;
  windowStart: string;
  windowEnd: string;
  status: string;
}) {
  const start = new Date(params.windowStart).getTime();
  const end = new Date(params.windowEnd).getTime();
  const durationMinutes = Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, (end - start) / 60000) : null;

  logInfo("rl.metrics.learning_window", {
    agent_version_id: params.agentVersionId,
    pair: params.pair,
    window_start: params.windowStart,
    window_end: params.windowEnd,
    duration_minutes: durationMinutes,
    status: params.status,
  });
}

export function recordFeatureQuality(params: {
  runId: string;
  pair: string;
  missingCount: number;
  oodScore: number;
  freshnessSeconds?: number | null;
  traceId?: string | null;
}) {
  logInfo("rl.metrics.feature_quality", {
    run_id: params.runId,
    pair: params.pair,
    missing_count: params.missingCount,
    ood_score: params.oodScore,
    freshness_seconds: params.freshnessSeconds ?? null,
    trace_id: params.traceId ?? null,
  });
  recordFeatureQualityMetrics({
    runId: params.runId,
    pair: params.pair,
    missingCount: params.missingCount,
    oodScore: params.oodScore,
    freshnessSeconds: params.freshnessSeconds ?? null,
    traceId: params.traceId ?? null,
  }).catch(() => {});
}
