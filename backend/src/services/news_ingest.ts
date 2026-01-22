import { loadEnv } from "../config/env";
import { fetchNewsFeed } from "../integrations/news/client";
import { hashContent } from "./dedup";
import { insertSignal } from "../db/repositories/signals";
import { findNewsByExternalId, findNewsByHash, insertNewsItem } from "../db/repositories/news_items";
import { getNewsSourceByIdentifier, upsertNewsSource } from "../db/repositories/news_sources";
import { createIngestionRun, completeIngestionRun } from "../db/repositories/ingestion_runs";
import { getDefaultThreshold, recordDataSourceStatus } from "./data_source_status_service";
import type { TradingPair } from "../types/rl";
import { logInfo, logWarn } from "./logger";
import { shouldRunIngestion } from "./ingestion_control";

const SUPPORTED_PAIRS: TradingPair[] = ["Gold-USDT", "XAUTUSDT", "PAXGUSDT"];

export async function runNewsIngest(trigger: "manual" | "schedule" = "schedule") {
  const env = loadEnv();
  const control = await shouldRunIngestion({
    sourceType: "news",
    sourceId: null,
    feed: null,
    trigger,
  });
  if (!control.allowed) {
    return { trigger, sources: 0, newCount: 0, skipped: true };
  }
  const identifiers: string[] = [];
  if (env.NEWS_FEED_URLS) {
    identifiers.push(...env.NEWS_FEED_URLS.split(",").map((item) => item.trim()).filter(Boolean));
  }
  if (env.NEWS_FEED_PATH) {
    identifiers.push(env.NEWS_FEED_PATH);
  }
  if (identifiers.length === 0) {
    return { trigger, sources: 0, newCount: 0, skipped: true };
  }

  const ingestionRun = await createIngestionRun({
    source_type: "news",
    source_id: null,
    feed: null,
    trigger,
    status: "running",
  });
  let newCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  try {
    for (const identifier of identifiers) {
      let source = await getNewsSourceByIdentifier(identifier);
      if (!source) {
        source = await upsertNewsSource({ name: identifier, identifier, enabled: true });
      }
      const items = await fetchNewsFeed(identifier);
      const limited = items.slice(0, env.NEWS_SYNC_LIMIT);
      for (const item of limited) {
        const contentValue = [item.title, item.summary, item.content].filter(Boolean).join(" ");
        const contentHash = contentValue ? hashContent(contentValue) : null;
        if (item.externalId) {
          const existing = await findNewsByExternalId(source.id, item.externalId);
          if (existing) {
            skippedCount += 1;
            continue;
          }
        }
        if (contentHash) {
          const existingByHash = await findNewsByHash(contentHash);
          if (existingByHash) {
            await insertNewsItem({
              source_id: source.id,
              external_id: item.externalId,
              title: item.title,
              url: item.url,
              summary: item.summary,
              content: item.content,
              content_hash: contentHash,
              published_at: item.publishedAt,
              dedup_status: "duplicate",
            });
            skippedCount += 1;
            continue;
          }
        }
        const inserted = await insertNewsItem({
          source_id: source.id,
          external_id: item.externalId,
          title: item.title,
          url: item.url,
          summary: item.summary,
          content: item.content,
          content_hash: contentHash,
          published_at: item.publishedAt,
        });
        await insertSignal({
          source_type: "news",
          idea_id: null,
          enrichment_id: null,
          news_item_id: inserted.id,
          payload_summary: item.summary ?? item.title,
          confidence_score: 0.3,
        });
        newCount += 1;
      }

      logInfo("News ingestion completed", { identifier, newCount, skippedCount });
    }
  } catch (error) {
    errorCount += 1;
    await completeIngestionRun(ingestionRun.id, {
      status: "failed",
      newCount,
      updatedCount: 0,
      errorCount,
      errorSummary: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  const now = new Date().toISOString();
  await Promise.all(
    SUPPORTED_PAIRS.map((pair) =>
      recordDataSourceStatus({
        pair,
        sourceType: "news",
        lastSeenAt: now,
        freshnessThresholdSeconds: getDefaultThreshold("news"),
      }),
    ),
  ).catch((error) => {
    logWarn("News data source status update failed", { error: String(error) });
  });

  await completeIngestionRun(ingestionRun.id, {
    status: "succeeded",
    newCount,
    updatedCount: 0,
    errorCount,
  });

  return { trigger, sources: identifiers.length, newCount, skippedCount };
}
