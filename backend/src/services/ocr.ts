import { loadEnv } from "../config/env";
import { getSupportedPairs } from "../config/market_catalog";
import { listPendingIdeaMedia, updateIdeaMedia } from "../db/repositories/idea_media";
import { createIngestionRun, completeIngestionRun } from "../db/repositories/ingestion_runs";
import { getDefaultThreshold, recordDataSourceStatus } from "./data_source_status_service";
import type { TradingPair } from "../types/rl";
import { logWarn } from "./logger";
import { shouldRunIngestion } from "./ingestion_control";

export async function runOcrBatch(limit = 10, trigger: "manual" | "schedule" = "schedule") {
  const env = loadEnv();
  const control = await shouldRunIngestion({
    sourceType: "ocr_text",
    sourceId: null,
    feed: null,
    trigger,
  });
  if (!control.allowed) {
    return { processed: 0, skipped: 0, failed: 0, skippedRun: true };
  }
  const ingestionRun = await createIngestionRun({
    source_type: "ocr_text",
    source_id: null,
    feed: null,
    trigger,
    status: "running",
  });
  const items = await listPendingIdeaMedia(limit);
  if (items.length === 0) {
    await completeIngestionRun(ingestionRun.id, {
      status: "succeeded",
      newCount: 0,
      updatedCount: 0,
      errorCount: 0,
    });
    return { processed: 0, skipped: 0, failed: 0 };
  }
  if (!env.OCR_ENABLED) {
    await Promise.all(
      items.map((item) =>
        updateIdeaMedia(item.id, {
          ocr_status: "skipped",
          ocr_text: null,
          ocr_confidence: null,
          ocr_provider: env.OCR_PROVIDER ?? "disabled",
        }),
      ),
    );
    await completeIngestionRun(ingestionRun.id, {
      status: "succeeded",
      newCount: 0,
      updatedCount: 0,
      errorCount: 0,
    });
    return { processed: 0, skipped: items.length, failed: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const text = await performOcr(item.media_url, env.OCR_PROVIDER ?? "mock");
      await updateIdeaMedia(item.id, {
        ocr_status: "processed",
        ocr_text: text,
        ocr_confidence: env.OCR_MIN_CONFIDENCE,
        ocr_provider: env.OCR_PROVIDER ?? "mock",
      });
      processed += 1;
    } catch (error) {
      failed += 1;
      logWarn("OCR failed", { error: String(error), media: item.media_url });
      await updateIdeaMedia(item.id, {
        ocr_status: "failed",
        ocr_provider: env.OCR_PROVIDER ?? "mock",
      });
    }
  }

  const result = { processed, skipped: 0, failed };
  const now = new Date().toISOString();
  await Promise.all(
    getSupportedPairs().map((pair) =>
      recordDataSourceStatus({
        pair,
        sourceType: "ocr_text",
        lastSeenAt: now,
        freshnessThresholdSeconds: getDefaultThreshold("ocr_text"),
      }),
    ),
  ).catch((error) => {
    logWarn("OCR data source status update failed", { error: String(error) });
  });

  await completeIngestionRun(ingestionRun.id, {
    status: failed > 0 ? "failed" : "succeeded",
    newCount: processed,
    updatedCount: 0,
    errorCount: failed,
    errorSummary: failed > 0 ? "OCR processing failures" : null,
  });

  return result;
}

async function performOcr(mediaUrl: string, provider: string) {
  if (provider === "mock") {
    return `OCR placeholder for ${mediaUrl}`;
  }
  throw new Error(`OCR provider ${provider} not configured`);
}
