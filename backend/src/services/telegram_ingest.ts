import { fetchTelegramMessages } from "../integrations/telegram/client";
import { normalizeTelegramContent, summarizeTelegramContent } from "../integrations/telegram/parser";
import { loadEnv } from "../config/env";
import { getSourceById } from "../db/repositories/sources";
import { createSyncRun, completeSyncRun } from "../db/repositories/sync_runs";
import { createIngestionRun, completeIngestionRun } from "../db/repositories/ingestion_runs";
import {
  findTelegramPostByContentHash,
  findTelegramPostByExternalId,
  insertTelegramPost,
  updateTelegramPost,
} from "../db/repositories/telegram_posts";
import { insertSignal } from "../db/repositories/signals";
import { hashContent } from "./dedup";
import { logInfo, logWarn } from "./logger";
import { getDefaultThreshold, recordDataSourceStatus } from "./data_source_status_service";
import type { TradingPair } from "../types/rl";
import { aggregateQuality, computeIdeaQuality } from "./ingestion_quality";
import { shouldRunIngestion } from "./ingestion_control";

export type TelegramTrigger = "manual" | "schedule";

const SUPPORTED_PAIRS: TradingPair[] = ["Gold-USDT", "XAUTUSDT", "PAXGUSDT"];

export async function runTelegramIngest(options: { sourceId: string; trigger: TelegramTrigger }) {
  const env = loadEnv();
  const source = await getSourceById(options.sourceId);
  if (source.type !== "telegram") {
    throw new Error(`Source ${source.id} is not a telegram source`);
  }

  const control = await shouldRunIngestion({
    sourceType: "telegram",
    sourceId: source.id,
    feed: null,
    trigger: options.trigger,
  });
  if (!control.allowed) {
    logInfo("Telegram ingest skipped", { reason: control.reason, source: source.identifier });
    return { runId: null, newCount: 0, updatedCount: 0, errorCount: 0, skipped: true };
  }

  const syncRun = await createSyncRun(source.id);
  const ingestionRun = await createIngestionRun({
    source_type: "telegram",
    source_id: source.id,
    feed: null,
    trigger: options.trigger,
    status: "running",
  });
  let newCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  const qualities: ReturnType<typeof computeIdeaQuality>[] = [];

  try {
    const messages = await fetchTelegramMessages(source.identifier, env.TELEGRAM_SYNC_LIMIT);
    logInfo("Fetched Telegram messages", { count: messages.length, source: source.identifier });

    for (const message of messages) {
      qualities.push(
        computeIdeaQuality({
          title: message.externalId,
          url: null,
          author: null,
          publishedAt: message.publishedAt ?? null,
          content: message.content,
        }),
      );
      const normalized = normalizeTelegramContent(message.content);
      const contentHash = hashContent(normalized || message.externalId);

      const existing = await findTelegramPostByExternalId(source.id, message.externalId);
      if (existing) {
        if (
          existing.content_hash !== contentHash ||
          existing.status !== message.status ||
          existing.edited_at !== message.editedAt
        ) {
          await updateTelegramPost(existing.id, {
            content: message.content,
            content_hash: contentHash,
            edited_at: message.editedAt,
            status: message.status,
            dedup_status: existing.dedup_status ?? "canonical",
            duplicate_of_id: existing.duplicate_of_id ?? null,
          });
          updatedCount += 1;
        }
        continue;
      }

      const canonicalMatch = normalized ? await findTelegramPostByContentHash(source.id, contentHash) : null;
      const dedupStatus = canonicalMatch ? "duplicate" : "canonical";
      const inserted = await insertTelegramPost({
        source_id: source.id,
        external_id: message.externalId,
        content: message.content,
        content_hash: contentHash,
        published_at: message.publishedAt,
        edited_at: message.editedAt,
        status: message.status,
        dedup_status: dedupStatus,
        duplicate_of_id: canonicalMatch?.id ?? null,
      });

      if (dedupStatus === "canonical" && message.status !== "removed") {
        await insertSignal({
          source_type: "telegram",
          idea_id: null,
          telegram_post_id: inserted.id,
          enrichment_id: null,
          payload_summary: summarizeTelegramContent(message.content),
          confidence_score: 0.5,
        });
        newCount += 1;
      }
    }

    const runQuality = aggregateQuality(qualities);
    await completeSyncRun(syncRun.id, {
      status: "succeeded",
      newCount,
      updatedCount,
      errorCount,
      coveragePct: runQuality.coverage_pct,
      missingFieldsCount: runQuality.missing_fields_count,
      parseConfidence: runQuality.parse_confidence,
    });
    await completeIngestionRun(ingestionRun.id, {
      status: "succeeded",
      newCount,
      updatedCount,
      errorCount,
      coveragePct: runQuality.coverage_pct,
      missingFieldsCount: runQuality.missing_fields_count,
      parseConfidence: runQuality.parse_confidence,
    });

    const now = new Date().toISOString();
    await Promise.all(
      SUPPORTED_PAIRS.map((pair) =>
        recordDataSourceStatus({
          pair,
          sourceType: "signals",
          lastSeenAt: now,
          freshnessThresholdSeconds: getDefaultThreshold("signals"),
        }),
      ),
    );

    return { runId: syncRun.id, newCount, updatedCount, errorCount };
  } catch (error) {
    errorCount += 1;
    const message = error instanceof Error ? error.message : String(error);
    logWarn("Telegram ingestion failed", { message, trigger: options.trigger });
    await completeSyncRun(syncRun.id, {
      status: "failed",
      newCount,
      updatedCount,
      errorCount,
      errorSummary: message,
    });
    await completeIngestionRun(ingestionRun.id, {
      status: "failed",
      newCount,
      updatedCount,
      errorCount,
      errorSummary: message,
    });
    throw error;
  }
}
