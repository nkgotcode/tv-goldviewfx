import { listSourcesByType } from "../db/repositories/sources";
import { runTelegramIngest } from "../services/telegram_ingest";
import { logInfo, logWarn } from "../services/logger";
import { enqueueRetry } from "../services/retry_queue_service";

export async function runTelegramIngestJob() {
  const sources = await listSourcesByType("telegram");
  if (sources.length === 0) {
    logInfo("No telegram sources configured");
    return { processed: 0 };
  }

  let processed = 0;
  for (const source of sources) {
    try {
      await runTelegramIngest({ sourceId: source.id, trigger: "schedule" });
    } catch (error) {
      await enqueueRetry({
        jobType: "telegram_ingest",
        payload: { sourceId: source.id },
        dedupeKey: `telegram_ingest:${source.id}`,
        error: error instanceof Error ? error.message : "telegram_ingest_failed",
      });
      logWarn("Telegram ingest scheduled retry", { error: String(error), sourceId: source.id });
    }
    processed += 1;
  }

  return { processed };
}
