import { loadEnv } from "../config/env";
import { loadRlServiceConfig } from "../config/rl_service";
import { resolveSupportedPair } from "../config/market_catalog";
import { listAgentRuns, updateAgentRun } from "../db/repositories/agent_runs";
import { insertLearningUpdate } from "../db/repositories/learning_updates";
import type { TradingPair } from "../types/rl";
import { runLearningUpdateFromReport, type PromotionGates, type RolloutPolicy } from "../jobs/learning_updates";
import { getLatestPromotedVersion } from "./agent_version_service";
import { runEvaluation } from "./evaluation_service";
import { logInfo, logWarn } from "./logger";
import { runTraining } from "./training_service";
import { rlServiceClient } from "../rl/client";

type OnlineLearningTrigger = "schedule" | "retry" | "manual";

export type OnlineLearningResult =
  | { status: "skipped"; reason: string }
  | {
      status: "completed";
      pair: string;
      interval: string;
      contextIntervals: string[];
      agentVersionId: string;
      challengerEvaluationReportId: string;
      championEvaluationReportId?: string | null;
      learningUpdateId: string;
      promoted: boolean;
      decisionReasons: string[];
      metricDeltas: Record<string, number>;
      trainWindow: { start: string; end: string };
      evalWindow: { start: string; end: string };
    };

function floorToInterval(date: Date, intervalMinutes: number) {
  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
  return new Date(Math.floor(date.getTime() / intervalMs) * intervalMs);
}

function parseIntervalMinutes(interval: string) {
  const match = interval.trim().match(/^(\d+)([mhdwM])$/);
  if (!match) return 1;
  const amount = Math.max(1, Number.parseInt(match[1], 10) || 1);
  const unit = match[2];
  if (unit === "m") return amount;
  if (unit === "h") return amount * 60;
  if (unit === "d") return amount * 60 * 24;
  if (unit === "w") return amount * 60 * 24 * 7;
  if (unit === "M") return amount * 60 * 24 * 30;
  return amount;
}

function parseContextIntervals(value?: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeContextIntervals(baseInterval: string, intervals?: string[] | null) {
  const base = baseInterval.trim();
  if (!intervals || intervals.length === 0) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const interval of intervals) {
    const value = interval.trim();
    if (!/^\d+(m|h|d|w|M)$/.test(value)) continue;
    if (value === base) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

export type OnlineLearningRunOverrides = {
  pair?: TradingPair;
  pairs?: TradingPair[];
  interval?: string;
  /** Additional candle intervals to run in the batch (e.g. ["15m","1h"]). */
  intervals?: string[];
  contextIntervals?: string[];
  trainWindowMin?: number;
  evalWindowMin?: number;
  evalLagMin?: number;
  windowSize?: number;
  stride?: number;
  timesteps?: number;
  decisionThreshold?: number;
  autoRollForward?: boolean;
  /** When true, evaluations request full available history (no downsampling cap). */
  fullHistory?: boolean;
  promotionGates?: Partial<PromotionGates> | null;
  rolloutPolicy?: Partial<RolloutPolicy> | null;
};

function parsePairs(value?: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizePairs(rawPairs: string[]) {
  const seen = new Set<string>();
  const normalized: TradingPair[] = [];
  for (const pair of rawPairs) {
    const resolved = resolveSupportedPair(pair);
    if (!resolved) continue;
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    normalized.push(resolved as TradingPair);
  }
  return normalized;
}

export function resolveOnlineLearningIntervals(overrides?: OnlineLearningRunOverrides): string[] {
  const env = loadEnv();
  // Explicit override takes priority
  if (overrides?.intervals?.length) {
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const iv of overrides.intervals) {
      const v = iv.trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      deduped.push(v);
    }
    if (deduped.length > 0) return deduped;
  }
  // Single override
  if (overrides?.interval) return [overrides.interval.trim()];
  // Env: RL_ONLINE_LEARNING_INTERVALS (CSV)
  if (env.RL_ONLINE_LEARNING_INTERVALS) {
    const parsed = env.RL_ONLINE_LEARNING_INTERVALS
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (parsed.length > 0) {
      // Always ensure the primary interval is in the list
      const primary = env.RL_ONLINE_LEARNING_INTERVAL;
      const seen = new Set<string>(parsed);
      const all = seen.has(primary) ? parsed : [primary, ...parsed];
      return all;
    }
  }
  // Fall back to single primary interval
  return [env.RL_ONLINE_LEARNING_INTERVAL];
}

export function resolveOnlineLearningPairs(overrides?: OnlineLearningRunOverrides) {
  const env = loadEnv();
  const fromOverrides = overrides?.pairs?.length ? normalizePairs(overrides.pairs) : [];
  if (fromOverrides.length > 0) return fromOverrides;
  if (overrides?.pair) {
    const resolved = resolveSupportedPair(overrides.pair);
    if (resolved) return [resolved as TradingPair];
  }
  const configuredPairs = normalizePairs(parsePairs(env.RL_ONLINE_LEARNING_PAIRS));
  if (configuredPairs.length > 0) return configuredPairs;
  const fallback = resolveSupportedPair(env.RL_ONLINE_LEARNING_PAIR) ?? env.RL_ONLINE_LEARNING_PAIR;
  return [fallback as TradingPair];
}

export async function runOnlineLearningCycleForPair(
  pair: TradingPair,
  trigger: OnlineLearningTrigger = "schedule",
  overrides?: Omit<OnlineLearningRunOverrides, "pair" | "pairs">,
): Promise<OnlineLearningResult> {
  const cycleStartedAt = new Date().toISOString();
  const env = loadEnv();
  if (!env.RL_ONLINE_LEARNING_ENABLED) {
    return { status: "skipped", reason: "disabled" };
  }

  const interval = overrides?.interval?.trim() || env.RL_ONLINE_LEARNING_INTERVAL;
  const intervalMinutes = parseIntervalMinutes(interval);
  const contextIntervals = normalizeContextIntervals(
    interval,
    overrides?.contextIntervals ?? parseContextIntervals(env.RL_ONLINE_LEARNING_CONTEXT_INTERVALS),
  );
  const evalLagMinutes = Math.max(0, overrides?.evalLagMin ?? env.RL_ONLINE_LEARNING_EVAL_LAG_MIN ?? intervalMinutes);
  const evalWindowMinutes = Math.max(intervalMinutes, overrides?.evalWindowMin ?? env.RL_ONLINE_LEARNING_EVAL_WINDOW_MIN);
  const trainWindowMinutes = Math.max(intervalMinutes, overrides?.trainWindowMin ?? env.RL_ONLINE_LEARNING_TRAIN_WINDOW_MIN);
  const windowSize = Math.max(1, overrides?.windowSize ?? env.RL_ONLINE_LEARNING_WINDOW_SIZE);
  const stride = Math.max(1, overrides?.stride ?? env.RL_ONLINE_LEARNING_STRIDE);
  const timesteps = Math.max(1, overrides?.timesteps ?? env.RL_ONLINE_LEARNING_TIMESTEPS);
  const decisionThreshold = overrides?.decisionThreshold ?? env.RL_ONLINE_LEARNING_DECISION_THRESHOLD;
  const autoRollForward = overrides?.autoRollForward ?? env.RL_ONLINE_LEARNING_AUTO_ROLL_FORWARD;

  const evalEnd = floorToInterval(new Date(Date.now() - evalLagMinutes * 60 * 1000), intervalMinutes);
  const evalStart = new Date(evalEnd.getTime() - evalWindowMinutes * 60 * 1000);
  const trainEnd = new Date(evalStart.getTime());
  const trainStart = new Date(trainEnd.getTime() - trainWindowMinutes * 60 * 1000);

  if (trainStart >= trainEnd || evalStart >= evalEnd) {
    logWarn("online_learning.invalid_window", {
      trigger,
      train_start: trainStart.toISOString(),
      train_end: trainEnd.toISOString(),
      eval_start: evalStart.toISOString(),
      eval_end: evalEnd.toISOString(),
    });
    return { status: "skipped", reason: "invalid_window" };
  }

  const previousPromoted = await getLatestPromotedVersion();
  const rlConfig = loadRlServiceConfig();
  if (rlConfig.mock) {
    logWarn("online_learning.skipped_mock_service", { trigger, pair });
    return { status: "skipped", reason: "rl_service_mock_enabled" };
  }
  await rlServiceClient.health();

  logInfo("online_learning.start", {
    trigger,
    pair,
    interval,
    context_intervals: contextIntervals,
    train_start: trainStart.toISOString(),
    train_end: trainEnd.toISOString(),
    eval_start: evalStart.toISOString(),
    eval_end: evalEnd.toISOString(),
  });

  const training = await runTraining({
    pair,
    periodStart: trainStart.toISOString(),
    periodEnd: trainEnd.toISOString(),
    interval,
    contextIntervals,
    windowSize,
    stride,
    timesteps,
  });

  const trainedVersionId = (training.agentVersion as { id?: string }).id;
  if (!trainedVersionId) {
    throw new Error("Online learning training did not return an agent version id");
  }

  const fullHistory = overrides?.fullHistory ?? env.RL_ONLINE_LEARNING_FULL_HISTORY;

  let report: Awaited<ReturnType<typeof runEvaluation>>;
  try {
    report = await runEvaluation({
      pair,
      periodStart: evalStart.toISOString(),
      periodEnd: evalEnd.toISOString(),
      interval,
      contextIntervals,
      agentVersionId: trainedVersionId,
      windowSize,
      stride,
      decisionThreshold,
      fullHistory,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await insertLearningUpdate({
      agent_version_id: trainedVersionId,
      window_start: evalStart.toISOString(),
      window_end: evalEnd.toISOString(),
      status: "failed",
      started_at: cycleStartedAt,
      completed_at: new Date().toISOString(),
      promoted: false,
      decision_reasons: [`evaluation_error:${reason}`],
      metric_deltas: {},
    });
    throw error;
  }

  let championReport: Awaited<ReturnType<typeof runEvaluation>> | null = null;
  if (previousPromoted?.id && previousPromoted.id !== trainedVersionId) {
    try {
      championReport = await runEvaluation({
        pair,
        periodStart: evalStart.toISOString(),
        periodEnd: evalEnd.toISOString(),
        interval,
        contextIntervals,
        agentVersionId: previousPromoted.id,
        windowSize,
        stride,
        decisionThreshold,
        fullHistory,
      });
    } catch (error) {
      logWarn("online_learning.champion_eval_failed", {
        pair,
        champion_version_id: previousPromoted.id,
        error: String(error),
      });
      championReport = null;
    }
  }

  const update = await runLearningUpdateFromReport({
    report,
    championReport,
    rollbackVersionId: previousPromoted?.id ?? null,
    promotionGates: overrides?.promotionGates ?? null,
    rolloutPolicy: overrides?.rolloutPolicy ?? null,
  });

  const promoted = Boolean((update as any).promoted);
  if (autoRollForward && promoted) {
    const activeRuns = await listAgentRuns({ pair });
    for (const run of activeRuns) {
      if (run.status !== "running") continue;
      if (run.agent_version_id === trainedVersionId) continue;
      await updateAgentRun(run.id, { agent_version_id: trainedVersionId });
    }
  }

  logInfo("online_learning.completed", {
    trigger,
    pair,
    interval,
    context_intervals: contextIntervals,
    agent_version_id: trainedVersionId,
    challenger_evaluation_report_id: report.id,
    champion_evaluation_report_id: championReport?.id ?? null,
    status: report.status,
    learning_update_id: update.id,
    promoted,
    decision_reasons: (update as any).decision_reasons ?? [],
  });

  return {
    status: "completed",
    pair,
    interval,
    contextIntervals,
    agentVersionId: trainedVersionId,
    challengerEvaluationReportId: report.id,
    championEvaluationReportId: championReport?.id ?? null,
    learningUpdateId: update.id,
    promoted,
    decisionReasons: ((update as any).decision_reasons ?? []) as string[],
    metricDeltas: (((update as any).metric_deltas ?? {}) as Record<string, number>) ?? {},
    trainWindow: { start: trainStart.toISOString(), end: trainEnd.toISOString() },
    evalWindow: { start: evalStart.toISOString(), end: evalEnd.toISOString() },
  };
}

export type OnlineLearningBatchResult = {
  status: "completed" | "partial" | "failed" | "skipped";
  requestedPairs: string[];
  requestedIntervals: string[];
  results: Array<{ pair: string; interval: string; result: OnlineLearningResult }>;
  failures: Array<{ pair: string; interval: string; error: string }>;
};

export async function runOnlineLearningBatch(
  trigger: OnlineLearningTrigger = "schedule",
  overrides?: OnlineLearningRunOverrides,
): Promise<OnlineLearningBatchResult> {
  const pairs = resolveOnlineLearningPairs(overrides);
  const intervals = resolveOnlineLearningIntervals(overrides);
  const results: Array<{ pair: string; interval: string; result: OnlineLearningResult }> = [];
  const failures: Array<{ pair: string; interval: string; error: string }> = [];

  if (pairs.length === 0 || intervals.length === 0) {
    return {
      status: "skipped",
      requestedPairs: pairs,
      requestedIntervals: intervals,
      results: [],
      failures: [],
    };
  }

  // Run all interval × pair combinations sequentially to avoid overwhelming the RL service.
  for (const interval of intervals) {
    for (const pair of pairs) {
      const cycleOverrides: Omit<OnlineLearningRunOverrides, "pair" | "pairs" | "interval" | "intervals"> = {
        contextIntervals: overrides?.contextIntervals,
        trainWindowMin: overrides?.trainWindowMin,
        evalWindowMin: overrides?.evalWindowMin,
        evalLagMin: overrides?.evalLagMin,
        windowSize: overrides?.windowSize,
        stride: overrides?.stride,
        timesteps: overrides?.timesteps,
        decisionThreshold: overrides?.decisionThreshold,
        autoRollForward: overrides?.autoRollForward,
        fullHistory: overrides?.fullHistory,
        promotionGates: overrides?.promotionGates,
        rolloutPolicy: overrides?.rolloutPolicy,
      };
      try {
        const result = await runOnlineLearningCycleForPair(pair, trigger, {
          ...cycleOverrides,
          interval,
        });
        results.push({ pair, interval, result });
      } catch (error) {
        failures.push({
          pair,
          interval,
          error: error instanceof Error ? error.message : String(error),
        });
        logWarn("online_learning.pair_interval_failed", {
          trigger,
          pair,
          interval,
          error: String(error),
        });
      }
    }
  }

  if (results.length === 0 && failures.length > 0) {
    return { status: "failed", requestedPairs: pairs, requestedIntervals: intervals, results, failures };
  }
  if (failures.length > 0) {
    return { status: "partial", requestedPairs: pairs, requestedIntervals: intervals, results, failures };
  }
  const skippedOnly = results.every((entry) => entry.result.status === "skipped");
  return {
    status: skippedOnly ? "skipped" : "completed",
    requestedPairs: pairs,
    requestedIntervals: intervals,
    results,
    failures,
  };
}

export async function runOnlineLearningCycle(
  trigger: OnlineLearningTrigger = "schedule",
  overrides?: OnlineLearningRunOverrides,
): Promise<OnlineLearningResult> {
  const pairs = resolveOnlineLearningPairs(overrides);
  const targetPair = pairs[0];
  if (!targetPair) return { status: "skipped", reason: "no_pairs_configured" };
  return runOnlineLearningCycleForPair(targetPair, trigger, overrides);
}
