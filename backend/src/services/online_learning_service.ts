import { loadEnv } from "../config/env";
import { loadRlServiceConfig } from "../config/rl_service";
import { listAgentRuns, updateAgentRun } from "../db/repositories/agent_runs";
import type { TradingPair } from "../types/rl";
import { runLearningUpdateFromReport, type PromotionGates } from "../jobs/learning_updates";
import { getLatestPromotedVersion } from "./agent_version_service";
import { runEvaluation } from "./evaluation_service";
import { logInfo, logWarn } from "./logger";
import { runTraining } from "./training_service";
import { rlServiceClient } from "../rl/client";

type OnlineLearningTrigger = "schedule" | "retry" | "manual";

type OnlineLearningResult =
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
  interval?: string;
  contextIntervals?: string[];
  trainWindowMin?: number;
  evalWindowMin?: number;
  evalLagMin?: number;
  windowSize?: number;
  stride?: number;
  timesteps?: number;
  decisionThreshold?: number;
  autoRollForward?: boolean;
  promotionGates?: Partial<PromotionGates> | null;
};

export async function runOnlineLearningCycle(
  trigger: OnlineLearningTrigger = "schedule",
  overrides?: OnlineLearningRunOverrides,
): Promise<OnlineLearningResult> {
  const env = loadEnv();
  if (!env.RL_ONLINE_LEARNING_ENABLED) {
    return { status: "skipped", reason: "disabled" };
  }

  const pair = (overrides?.pair ?? env.RL_ONLINE_LEARNING_PAIR) as TradingPair;
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

  const report = await runEvaluation({
    pair,
    periodStart: evalStart.toISOString(),
    periodEnd: evalEnd.toISOString(),
    interval,
    contextIntervals,
    agentVersionId: trainedVersionId,
    windowSize,
    stride,
    decisionThreshold,
    walkForward: {
      folds: 4,
      purgeBars: 1,
      embargoBars: 1,
      minTrainBars: Math.max(windowSize * 2, 60),
      strict: true,
    },
  });

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
        walkForward: {
          folds: 4,
          purgeBars: 1,
          embargoBars: 1,
          minTrainBars: Math.max(windowSize * 2, 60),
          strict: true,
        },
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
