import { runOnlineLearningBatch } from "../services/online_learning_service";
import { enqueueRetry } from "../services/retry_queue_service";
import { logWarn } from "../services/logger";

export async function runOnlineLearningJob() {
  try {
    const batch = await runOnlineLearningBatch("schedule");
    if (batch.failures.length > 0) {
      await enqueueRetry({
        jobType: "online_learning",
        payload: { pairs: batch.failures.map((failure) => failure.pair) },
        dedupeKey: `online_learning:schedule:${batch.failures.map((failure) => failure.pair).join(",")}`,
        error: "online_learning_partial_failure",
      });
      logWarn("Online learning partial retry queued", {
        failed_pairs: batch.failures.map((failure) => failure.pair),
      });
    }
    return batch;
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
