import { loadEnv } from "../config/env";
import {
  insertRetryQueueItem,
  findPendingRetryByKey,
  listDueRetryQueueItems,
  listRetryQueueItems,
  updateRetryQueueItem,
} from "../db/repositories/retry_queue";
import { runTradingViewSync } from "./tradingview_sync";
import { runTelegramIngest } from "./telegram_ingest";
import { runBingxMarketDataIngest } from "./bingx_market_data_ingest";
import { runNewsIngest } from "./news_ingest";
import { runOcrBatch } from "./ocr";
import { recordOpsAudit } from "./ops_audit";
import { runOnlineLearningBatch } from "./online_learning_service";
import { runEvaluationConfirmHeal } from "./evaluation_confirm_heal_service";
import type { EvaluationConfirmHealPayload } from "./evaluation_confirm_heal_service";

type RetryJobPayload = Record<string, unknown>;

type RetryQueueItem = {
  id: string;
  job_type: string;
  payload?: RetryJobPayload;
  status?: "pending" | "processing" | "succeeded" | "failed";
  attempts?: number;
  max_attempts?: number;
  next_attempt_at?: string;
  updated_at?: string;
};

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
  online_learning: async (payload) => {
    await runOnlineLearningBatch("retry", {
      pairs: payload.pairs as string[] | undefined,
    });
  },
  evaluation_confirm_heal: async (payload) => {
    await runEvaluationConfirmHeal({
      agentId: payload.agentId as string,
      actor: (payload.actor as string | undefined) ?? "system",
      evaluation: payload.evaluation as EvaluationConfirmHealPayload["evaluation"],
      heal: (payload.heal as EvaluationConfirmHealPayload["heal"]) ?? {},
    });
  },
};

function backoffSeconds(attempts: number, baseSeconds: number, maxSeconds: number) {
  const next = Math.min(maxSeconds, baseSeconds * Math.pow(2, Math.max(0, attempts - 1)));
  return Math.max(baseSeconds, next);
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`${label}_timeout_${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function recoverStaleProcessingItems(params: {
  staleSeconds: number;
  baseBackoffSeconds: number;
  maxBackoffSeconds: number;
  scanLimit: number;
}) {
  const allItems = (await listRetryQueueItems(params.scanLimit)) as RetryQueueItem[];
  const nowMs = Date.now();
  for (const item of allItems) {
    if (item.status !== "processing") continue;
    const updatedAtMs = item.updated_at ? new Date(item.updated_at).getTime() : Number.NaN;
    if (!Number.isFinite(updatedAtMs)) continue;
    const ageSeconds = Math.floor((nowMs - updatedAtMs) / 1000);
    if (ageSeconds < params.staleSeconds) continue;

    const attempts = (item.attempts ?? 0) + 1;
    const maxAttempts = item.max_attempts ?? 5;
    if (attempts >= maxAttempts) {
      await updateRetryQueueItem(item.id, {
        status: "failed",
        attempts,
        last_error: `stale_processing_recovered_after_${ageSeconds}s`,
      });
      continue;
    }

    const delaySeconds = backoffSeconds(attempts, params.baseBackoffSeconds, params.maxBackoffSeconds);
    const nextAttempt = new Date(Date.now() + delaySeconds * 1000).toISOString();
    await updateRetryQueueItem(item.id, {
      status: "pending",
      attempts,
      next_attempt_at: nextAttempt,
      last_error: `stale_processing_recovered_after_${ageSeconds}s`,
    });
  }
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
  const handlerTimeoutMs = parsePositiveInt(process.env.RETRY_QUEUE_HANDLER_TIMEOUT_SEC, 900) * 1000;
  const staleRecoverSeconds = parsePositiveInt(process.env.RETRY_QUEUE_STALE_RECOVERY_SEC, 600);
  const staleScanLimit = Math.max(limit * 5, 100);

  await recoverStaleProcessingItems({
    staleSeconds: staleRecoverSeconds,
    baseBackoffSeconds: env.INGESTION_DEFAULT_BACKOFF_BASE_SECONDS,
    maxBackoffSeconds: env.INGESTION_DEFAULT_BACKOFF_MAX_SECONDS,
    scanLimit: staleScanLimit,
  });

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
      await runWithTimeout(
        handler(item.payload ?? {}),
        handlerTimeoutMs,
        `retry_queue_${item.job_type}`,
      );
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
      // Small jitter helps avoid lockstep retries when multiple jobs fail together.
      await sleep(50);
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
