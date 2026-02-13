import { runNewsIngest } from "../services/news_ingest";
import { enqueueRetry } from "../services/retry_queue_service";
import { logWarn } from "../services/logger";

export async function runNewsIngestJob() {
  try {
    return await runNewsIngest("schedule");
  } catch (error) {
    await enqueueRetry({
      jobType: "news_ingest",
      payload: {},
      dedupeKey: "news_ingest:schedule",
      error: error instanceof Error ? error.message : "news_ingest_failed",
    });
    logWarn("News ingest scheduled retry", { error: String(error) });
    throw error;
  }
}
