import { fetchIdeaContent, fetchProfileHtml, mapWithConcurrency } from "../integrations/tradingview/client";
import { extractIdeasFromProfile } from "../integrations/tradingview/parser";
import { loadEnv } from "../config/env";
import { getSupportedPairs } from "../config/market_catalog";
import { getOrCreateSource } from "../db/repositories/sources";
import { createRevision } from "../db/repositories/idea_revisions";
import { createSyncRun, completeSyncRun } from "../db/repositories/sync_runs";
import { findIdeaByContentHash, findIdeaByExternalId, insertIdea, updateIdea } from "../db/repositories/ideas";
import { startIngestionRunIfIdle, completeIngestionRun } from "../db/repositories/ingestion_runs";
import { insertIdeaMedia } from "../db/repositories/idea_media";
import { getIngestionConfig } from "../db/repositories/ingestion_configs";
import { getDefaultThreshold, recordDataSourceStatus } from "./data_source_status_service";
import type { TradingPair } from "../types/rl";
import { hashContent, normalizeContent } from "./dedup";
import { logInfo, logWarn } from "./logger";
import { aggregateQuality, computeIdeaQuality } from "./ingestion_quality";
import { shouldRunIngestion } from "./ingestion_control";

export type SyncTrigger = "manual" | "schedule";

const E2E_RUN_ENABLED = ["1", "true", "yes", "on"].includes((process.env.E2E_RUN ?? "").trim().toLowerCase());

function getRecencyCutoffDays(recentDays: number): Date | null {
  if (recentDays <= 0) {
    return null;
  }
  const msPerDay = 24 * 60 * 60 * 1000;
  return new Date(Date.now() - recentDays * msPerDay);
}

function isIdeaWithinCutoff(publishedAt: string | null, cutoff: Date | null): boolean {
  if (!cutoff || !publishedAt) {
    return true;
  }
  const parsed = new Date(publishedAt);
  if (Number.isNaN(parsed.getTime())) {
    return true;
  }
  return parsed >= cutoff;
}

function filterIdeasByRecency<T extends { publishedAt: string | null }>(ideas: T[], cutoff: Date | null) {
  if (!cutoff) {
    return { ideas, skipped: 0 };
  }
  const filtered = ideas.filter((idea) => isIdeaWithinCutoff(idea.publishedAt, cutoff));
  return { ideas: filtered, skipped: ideas.length - filtered.length };
}

export async function runTradingViewSync(options: {
  trigger: SyncTrigger;
  sourceId?: string;
  fetchFull?: boolean;
  includeUpdates?: boolean;
}) {
  const env = loadEnv();
  const sourceIdentifier =
    options.sourceId ??
    env.TRADINGVIEW_PROFILE_URL ??
    (env.TRADINGVIEW_USE_HTML ? env.TRADINGVIEW_HTML_PATH : undefined) ??
    env.TRADINGVIEW_HTML_PATH ??
    "tradingview";
  if (E2E_RUN_ENABLED) {
    const runId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return { runId, newCount: 0, updatedCount: 0, errorCount: 0 };
  }
  const source = await getOrCreateSource("tradingview", sourceIdentifier, "TradingView");
  const control = await shouldRunIngestion({
    sourceType: "tradingview",
    sourceId: source.id,
    feed: null,
    trigger: options.trigger,
  });
  if (!control.allowed) {
    logInfo("TradingView sync skipped", { reason: control.reason, source: sourceIdentifier });
    return { runId: null, newCount: 0, updatedCount: 0, errorCount: 0, skipped: true };
  }

  const config = await getIngestionConfig("tradingview", source.id, null);
  const rateLimit = config?.rate_limit_per_minute;
  const delayMs = rateLimit ? Math.max(env.SYNC_DELAY_MS, Math.ceil(60000 / rateLimit)) : env.SYNC_DELAY_MS;
  const ingestionLease = await startIngestionRunIfIdle({
    sourceType: "tradingview",
    sourceId: source.id,
    feed: null,
    trigger: options.trigger,
    timeoutMinutes: env.INGESTION_RUN_TIMEOUT_MIN,
  });
  if (!ingestionLease.created || !ingestionLease.run?.id) {
    logInfo("TradingView sync lease unavailable", {
      source: sourceIdentifier,
      reason: ingestionLease.reason,
    });
    return { runId: null, newCount: 0, updatedCount: 0, errorCount: 0, skipped: true };
  }
  const ingestionRunId = ingestionLease.run.id;
  if (ingestionLease.timed_out_run_id) {
    logWarn("TradingView sync lease timed out prior run", {
      source: sourceIdentifier,
      timedOutRunId: ingestionLease.timed_out_run_id,
    });
  }
  const syncRun = await createSyncRun(source.id);
  const recencyCutoff = getRecencyCutoffDays(env.TRADINGVIEW_RECENT_DAYS);

  let newCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  const qualities: ReturnType<typeof computeIdeaQuality>[] = [];

  try {
    const profileHtml = await fetchProfileHtml();
    const ideas = extractIdeasFromProfile(profileHtml);
    logInfo("Parsed TradingView ideas", { count: ideas.length, source: sourceIdentifier });
    const { ideas: recentIdeas, skipped } = filterIdeasByRecency(ideas, recencyCutoff);
    if (skipped > 0) {
      logInfo("Skipped ideas outside recency window", {
        skipped,
        days: env.TRADINGVIEW_RECENT_DAYS,
      });
    }

    const fetchFull = options.fetchFull ?? env.FETCH_FULL;
    const includeUpdates = options.includeUpdates ?? env.INCLUDE_UPDATES;

    const enrichedIdeas = fetchFull
      ? await mapWithConcurrency(recentIdeas, env.SYNC_CONCURRENCY, async (idea, index) => {
          const result = await fetchIdeaContent(
            idea.url,
            includeUpdates,
            delayMs,
            env.TRADINGVIEW_HTTP_TIMEOUT_MS,
          );
          if (result.content) {
            idea.excerpt = result.content;
          }
          if (result.publishedAt) {
            idea.publishedAt = result.publishedAt;
          }
          if (result.imageUrls.length) {
            idea.imageUrls = result.imageUrls;
          }
          if ((index + 1) % 5 === 0) {
            logInfo("Fetched idea pages", { count: index + 1 });
          }
          return idea;
        })
      : recentIdeas;

    if (fetchFull && env.TRADINGVIEW_INCOMPLETE_RETRY_MAX > 0) {
      const incompleteIdeas = enrichedIdeas.filter((idea) => {
        const content = idea.excerpt ?? "";
        return content.length < env.INGESTION_MIN_CONTENT_LENGTH;
      });
      if (incompleteIdeas.length) {
        await mapWithConcurrency(incompleteIdeas, env.SYNC_CONCURRENCY, async (idea) => {
          for (let attempt = 0; attempt < env.TRADINGVIEW_INCOMPLETE_RETRY_MAX; attempt += 1) {
            await Bun.sleep(env.TRADINGVIEW_INCOMPLETE_RETRY_DELAY_MS);
            const result = await fetchIdeaContent(
              idea.url,
              includeUpdates,
              delayMs,
              env.TRADINGVIEW_HTTP_TIMEOUT_MS,
            );
            if (result.content) {
              idea.excerpt = result.content;
            }
            if (result.publishedAt) {
              idea.publishedAt = result.publishedAt;
            }
            if (result.imageUrls.length) {
              idea.imageUrls = result.imageUrls;
            }
            const contentLength = (idea.excerpt ?? "").length;
            if (contentLength >= env.INGESTION_MIN_CONTENT_LENGTH) {
              break;
            }
          }
          return idea;
        });
      }
    }

    const { ideas: recencyFilteredIdeas, skipped: skippedAfterFetch } = filterIdeasByRecency(
      enrichedIdeas,
      recencyCutoff,
    );
    if (skippedAfterFetch > 0) {
      logInfo("Skipped ideas after content fetch due to recency window", {
        skipped: skippedAfterFetch,
        days: env.TRADINGVIEW_RECENT_DAYS,
      });
    }

    for (const idea of recencyFilteredIdeas) {
      const contentValue = normalizeContent(idea.excerpt ?? idea.title);
      const contentHash = hashContent(contentValue);
      qualities.push(
        computeIdeaQuality({
          title: idea.title,
          url: idea.url,
          author: idea.author ?? null,
          publishedAt: idea.publishedAt ?? null,
          content: idea.excerpt ?? null,
        }),
      );

      if (idea.externalId) {
        const existing = await findIdeaByExternalId(source.id, idea.externalId);
        if (existing) {
          if (existing.content_hash !== contentHash) {
            await createRevision(existing.id, existing.content ?? "", existing.content_hash);
            await updateIdea(existing.id, {
              title: idea.title,
              author_handle: idea.author,
              content: idea.excerpt ?? null,
              content_hash: contentHash,
              published_at: idea.publishedAt,
              dedup_status: "canonical",
              duplicate_of_id: null,
            });
            if (idea.imageUrls?.length) {
              await Promise.all(idea.imageUrls.map((url) => insertIdeaMedia({ idea_id: existing.id, media_url: url })));
            }
            updatedCount += 1;
            continue;
          }
          await updateIdea(existing.id, {
            title: idea.title,
            author_handle: idea.author,
            content: idea.excerpt ?? null,
            published_at: idea.publishedAt,
          });
          if (idea.imageUrls?.length) {
            await Promise.all(idea.imageUrls.map((url) => insertIdeaMedia({ idea_id: existing.id, media_url: url })));
          }
          continue;
        }
      }

      const canonicalMatch = await findIdeaByContentHash(source.id, contentHash);
      if (canonicalMatch) {
        const inserted = await insertIdea({
          source_id: source.id,
          external_id: idea.externalId,
          url: idea.url,
          title: idea.title,
          author_handle: idea.author,
          content: idea.excerpt ?? null,
          content_hash: contentHash,
          published_at: idea.publishedAt,
          dedup_status: "duplicate",
          duplicate_of_id: canonicalMatch.id,
        });
        if (idea.imageUrls?.length) {
          await Promise.all(idea.imageUrls.map((url) => insertIdeaMedia({ idea_id: inserted.id, media_url: url })));
        }
        continue;
      }

      const inserted = await insertIdea({
        source_id: source.id,
        external_id: idea.externalId,
        url: idea.url,
        title: idea.title,
        author_handle: idea.author,
        content: idea.excerpt ?? null,
        content_hash: contentHash,
        published_at: idea.publishedAt,
        dedup_status: "canonical",
      });
      if (idea.imageUrls?.length) {
        await Promise.all(idea.imageUrls.map((url) => insertIdeaMedia({ idea_id: inserted.id, media_url: url })));
      }
      newCount += 1;
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
    await completeIngestionRun(ingestionRunId, {
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
      getSupportedPairs().map((pair) =>
        recordDataSourceStatus({
          pair,
          sourceType: "ideas",
          lastSeenAt: now,
          freshnessThresholdSeconds: getDefaultThreshold("ideas"),
        }),
      ),
    );

    return { runId: syncRun.id, newCount, updatedCount, errorCount };
  } catch (error) {
    errorCount += 1;
    const message = error instanceof Error ? error.message : String(error);
    logWarn("TradingView sync failed", { message, trigger: options.trigger });
    await completeSyncRun(syncRun.id, {
      status: "failed",
      newCount,
      updatedCount,
      errorCount,
      errorSummary: message,
    });
    await completeIngestionRun(ingestionRunId, {
      status: "failed",
      newCount,
      updatedCount,
      errorCount,
      errorSummary: message,
    });
    throw error;
  }
}
