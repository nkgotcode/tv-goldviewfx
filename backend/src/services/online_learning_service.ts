import { loadEnv } from "../config/env";
import { loadRlServiceConfig } from "../config/rl_service";
import { listAgentRuns, updateAgentRun } from "../db/repositories/agent_runs";
import type { TradingPair } from "../types/rl";
import { runLearningUpdateFromReport } from "../jobs/learning_updates";
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

export async function runOnlineLearningCycle(trigger: OnlineLearningTrigger = "schedule"): Promise<OnlineLearningResult> {
  const env = loadEnv();
  if (!env.RL_ONLINE_LEARNING_ENABLED) {
    return { status: "skipped", reason: "disabled" };
  }

  const intervalMinutes = Math.max(1, env.BINGX_MARKET_DATA_INTERVAL_MIN);
  const evalLagMinutes = env.RL_ONLINE_LEARNING_EVAL_LAG_MIN ?? intervalMinutes;
  const evalWindowMinutes = env.RL_ONLINE_LEARNING_EVAL_WINDOW_MIN;
  const trainWindowMinutes = env.RL_ONLINE_LEARNING_TRAIN_WINDOW_MIN;

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

  const pair = env.RL_ONLINE_LEARNING_PAIR as TradingPair;
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
    train_start: trainStart.toISOString(),
    train_end: trainEnd.toISOString(),
    eval_start: evalStart.toISOString(),
    eval_end: evalEnd.toISOString(),
  });

  const training = await runTraining({
    pair,
    periodStart: trainStart.toISOString(),
    periodEnd: trainEnd.toISOString(),
    windowSize: env.RL_ONLINE_LEARNING_WINDOW_SIZE,
    stride: env.RL_ONLINE_LEARNING_STRIDE,
    timesteps: env.RL_ONLINE_LEARNING_TIMESTEPS,
  });

  const trainedVersionId = (training.agentVersion as { id?: string }).id;
  if (!trainedVersionId) {
    throw new Error("Online learning training did not return an agent version id");
  }

  const report = await runEvaluation({
    pair,
    periodStart: evalStart.toISOString(),
    periodEnd: evalEnd.toISOString(),
    agentVersionId: trainedVersionId,
    windowSize: env.RL_ONLINE_LEARNING_WINDOW_SIZE,
    stride: env.RL_ONLINE_LEARNING_STRIDE,
    decisionThreshold: env.RL_ONLINE_LEARNING_DECISION_THRESHOLD,
    walkForward: {
      folds: 4,
      purgeBars: 1,
      embargoBars: 1,
      minTrainBars: Math.max(env.RL_ONLINE_LEARNING_WINDOW_SIZE * 2, 60),
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
        agentVersionId: previousPromoted.id,
        windowSize: env.RL_ONLINE_LEARNING_WINDOW_SIZE,
        stride: env.RL_ONLINE_LEARNING_STRIDE,
        decisionThreshold: env.RL_ONLINE_LEARNING_DECISION_THRESHOLD,
        walkForward: {
          folds: 4,
          purgeBars: 1,
          embargoBars: 1,
          minTrainBars: Math.max(env.RL_ONLINE_LEARNING_WINDOW_SIZE * 2, 60),
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
  });

  const promoted = Boolean((update as any).promoted);
  if (env.RL_ONLINE_LEARNING_AUTO_ROLL_FORWARD && promoted) {
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
