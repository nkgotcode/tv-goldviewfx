import { runOnlineLearningCycle } from "../services/online_learning_service";
import { enqueueRetry } from "../services/retry_queue_service";
import { logWarn } from "../services/logger";

export async function runOnlineLearningJob() {
  try {
    return await runOnlineLearningCycle("schedule");
  } catch (error) {
    await enqueueRetry({
      jobType: "online_learning",
      payload: {},
      dedupeKey: "online_learning:schedule",
      error: error instanceof Error ? error.message : "online_learning_failed",
    });
    logWarn("Online learning scheduled retry", { error: String(error) });
    throw error;
  }
}
