import { logInfo } from "./logger";

export function recordDecisionLatency(params: {
  runId: string;
  pair: string;
  mode?: string;
  latencyMs: number;
  warnings?: string[];
}) {
  logInfo("rl.metrics.decision_latency", {
    run_id: params.runId,
    pair: params.pair,
    mode: params.mode ?? "unknown",
    latency_ms: params.latencyMs,
    warnings: params.warnings ?? [],
  });
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
