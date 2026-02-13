import { runOcrBatch } from "../services/ocr";
import { enqueueRetry } from "../services/retry_queue_service";
import { logWarn } from "../services/logger";

export async function runOcrJob() {
  try {
    return await runOcrBatch(20);
  } catch (error) {
    await enqueueRetry({
      jobType: "ocr_run",
      payload: { limit: 20 },
      dedupeKey: "ocr_run:schedule",
      error: error instanceof Error ? error.message : "ocr_run_failed",
    });
    logWarn("OCR job scheduled retry", { error: String(error) });
    throw error;
  }
}
