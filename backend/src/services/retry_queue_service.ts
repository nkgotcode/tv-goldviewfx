import { loadEnv } from "../config/env";
import {
  insertRetryQueueItem,
  findPendingRetryByKey,
  listDueRetryQueueItems,
  updateRetryQueueItem,
} from "../db/repositories/retry_queue";
import { runTradingViewSync } from "./tradingview_sync";
import { runTelegramIngest } from "./telegram_ingest";
import { runBingxMarketDataIngest } from "./bingx_market_data_ingest";
import { runNewsIngest } from "./news_ingest";
import { runOcrBatch } from "./ocr";
import { recordOpsAudit } from "./ops_audit";
import { runOnlineLearningCycle } from "./online_learning_service";

type RetryJobPayload = Record<string, unknown>;

const handlers: Record<string, (payload: RetryJobPayload) => Promise<void>> = {
  noop: async () => {},
  tradingview_sync: async (payload) => {
    await runTradingViewSync({
      trigger: "retry",
      sourceId: payload.sourceId as string | undefined,
      fetchFull: payload.fetchFull as boolean | undefined,
      includeUpdates: payload.includeUpdates as boolean | undefined,
    });
  },
  telegram_ingest: async (payload) => {
    const sourceId = payload.sourceId as string | undefined;
    if (!sourceId) {
      throw new Error("Missing sourceId for telegram ingest retry");
    }
    await runTelegramIngest({ sourceId, trigger: "retry" });
  },
  bingx_market_data: async (payload) => {
    await runBingxMarketDataIngest({
      pairs: payload.pairs as string[] | undefined,
      intervals: payload.intervals as string[] | undefined,
      maxBatches: payload.maxBatches as number | undefined,
      backfill: payload.backfill as boolean | undefined,
      trigger: "retry",
    });
  },
  news_ingest: async () => {
    await runNewsIngest("retry");
  },
  ocr_run: async (payload) => {
    const limit = payload.limit as number | undefined;
    await runOcrBatch(limit ?? 10);
  },
  online_learning: async () => {
    await runOnlineLearningCycle("retry");
  },
};

function backoffSeconds(attempts: number, baseSeconds: number, maxSeconds: number) {
  const next = Math.min(maxSeconds, baseSeconds * Math.pow(2, Math.max(0, attempts - 1)));
  return Math.max(baseSeconds, next);
}

export async function enqueueRetry(params: {
  jobType: keyof typeof handlers;
  payload: RetryJobPayload;
  dedupeKey?: string;
  maxAttempts?: number;
  error?: string | null;
}) {
  if (params.dedupeKey) {
    const existing = await findPendingRetryByKey(params.jobType, params.dedupeKey);
    if (existing) {
      return existing;
    }
  }
  return insertRetryQueueItem({
    job_type: params.jobType,
    payload: params.payload,
    status: "pending",
    attempts: 0,
    max_attempts: params.maxAttempts ?? 5,
    next_attempt_at: new Date().toISOString(),
    dedupe_key: params.dedupeKey ?? null,
    last_error: params.error ?? null,
  });
}

export async function processRetryQueue(limit = 20) {
  const env = loadEnv();
  const items = await listDueRetryQueueItems(limit);
  for (const item of items) {
    const handler = handlers[item.job_type];
    if (!handler) {
      await updateRetryQueueItem(item.id, {
        status: "failed",
        last_error: `Unknown job type: ${item.job_type}`,
      });
      continue;
    }
    await updateRetryQueueItem(item.id, { status: "processing" });
    try {
      await handler(item.payload ?? {});
      await updateRetryQueueItem(item.id, {
        status: "succeeded",
        last_error: null,
      });
      await recordOpsAudit({
        actor: "system",
        action: "retry_queue.succeeded",
        resource_type: "retry_queue",
        resource_id: item.id,
        metadata: { job_type: item.job_type },
      });
    } catch (error) {
      const attempts = (item.attempts ?? 0) + 1;
      if (attempts >= (item.max_attempts ?? 5)) {
        await updateRetryQueueItem(item.id, {
          status: "failed",
          attempts,
          last_error: error instanceof Error ? error.message : "retry_failed",
        });
        await recordOpsAudit({
          actor: "system",
          action: "retry_queue.failed",
          resource_type: "retry_queue",
          resource_id: item.id,
          metadata: { job_type: item.job_type, attempts },
        });
        continue;
      }
      const delaySeconds = backoffSeconds(attempts, env.INGESTION_DEFAULT_BACKOFF_BASE_SECONDS, env.INGESTION_DEFAULT_BACKOFF_MAX_SECONDS);
      const nextAttempt = new Date(Date.now() + delaySeconds * 1000).toISOString();
      await updateRetryQueueItem(item.id, {
        status: "pending",
        attempts,
        next_attempt_at: nextAttempt,
        last_error: error instanceof Error ? error.message : "retry_failed",
      });
    }
  }
  return { processed: items.length };
}
