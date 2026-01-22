import { listSourcesByType } from "../db/repositories/sources";
import { runTelegramIngest } from "../services/telegram_ingest";
import { logInfo } from "../services/logger";

export async function runTelegramIngestJob() {
  const sources = await listSourcesByType("telegram");
  if (sources.length === 0) {
    logInfo("No telegram sources configured");
    return { processed: 0 };
  }

  let processed = 0;
  for (const source of sources) {
    await runTelegramIngest({ sourceId: source.id, trigger: "schedule" });
    processed += 1;
  }

  return { processed };
}
