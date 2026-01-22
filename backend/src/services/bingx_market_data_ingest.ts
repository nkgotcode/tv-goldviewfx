import { loadEnv } from "../config/env";
import {
  getLatestCandleTime,
  getEarliestCandleTime,
  upsertBingxCandles,
  insertOrderBookSnapshot,
  upsertBingxTrades,
  getLatestTradeTime,
  upsertBingxFundingRates,
  getLatestFundingTime,
  getEarliestFundingTime,
  upsertBingxOpenInterest,
  getLatestOpenInterestTime,
  upsertBingxMarkIndexPrices,
  getLatestMarkIndexTime,
  upsertBingxTickers,
  getLatestTickerTime,
} from "../db/repositories/bingx_market_data";
import { createIngestionRun, completeIngestionRun } from "../db/repositories/ingestion_runs";
import { logInfo, logWarn } from "./logger";
import { markSourceUnavailable, recordDataSourceStatus, listDataSourceStatusWithConfig } from "./data_source_status_service";
import type { TradingPair } from "../types/rl";
import { getOrCreateSource } from "../db/repositories/sources";
import { completeSyncRun, createSyncRun } from "../db/repositories/sync_runs";
import { shouldRunIngestion } from "./ingestion_control";

const DEFAULT_BASE_URL = "https://open-api.bingx.com";
const DEFAULT_PAIRS: TradingPair[] = ["Gold-USDT", "XAUTUSDT", "PAXGUSDT"];
const DEFAULT_INTERVALS = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d", "3d", "1w", "1M"];

const DEFAULT_THRESHOLDS = {
  candles: 120,
  orderbook: 60,
  trades: 120,
  funding: 60 * 60 * 8,
  openInterest: 120,
  markIndex: 120,
  ticker: 120,
};

const DEFAULT_LIMITS = {
  candles: 500,
  trades: 1000,
  funding: 1000,
};

const FUNDING_INTERVAL_MS = 8 * 60 * 60 * 1000;
const MAX_TRADES_BATCHES_PER_RUN = 3;

const BINGX_SYMBOL_MAP: Record<TradingPair, string> = {
  "Gold-USDT": "GOLD-USDT",
  XAUTUSDT: "XAUT-USDT",
  PAXGUSDT: "PAXG-USDT",
};

function toBingxSymbol(pair: TradingPair) {
  return BINGX_SYMBOL_MAP[pair] ?? pair.toUpperCase();
}

function isTruthy(value: string | undefined) {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export type BingxIngestOptions = {
  pairs?: TradingPair[];
  intervals?: string[];
  backfill?: boolean;
  maxBatches?: number;
  fetcher?: typeof fetch;
  now?: Date;
  trigger?: "manual" | "schedule";
};

export type BingxIngestSummary = {
  pair: TradingPair;
  candlesInserted: number;
  tradesInserted: number;
  fundingInserted: number;
  openInterestInserted: number;
  markIndexInserted: number;
  tickersInserted: number;
};

export async function runBingxMarketDataIngest(options: BingxIngestOptions = {}) {
  const env = loadEnv();
  const baseUrl = env.BINGX_BASE_URL ?? DEFAULT_BASE_URL;
  const fetcher = options.fetcher ?? fetch;
  const usesDefaultFetcher = !options.fetcher || options.fetcher === fetch;
  const pairs = options.pairs ?? DEFAULT_PAIRS;
  const intervals = options.intervals ?? parseIntervals(env.BINGX_MARKET_DATA_INTERVALS) ?? DEFAULT_INTERVALS;
  const backfill = options.backfill ?? env.BINGX_MARKET_DATA_BACKFILL;
  const maxBatches =
    typeof options.maxBatches === "number" && options.maxBatches > 0
      ? options.maxBatches
      : backfill
        ? Number.POSITIVE_INFINITY
        : 1;
  const now = options.now ?? new Date();
  const trigger = options.trigger ?? "schedule";
  const mockEnabled = env.BINGX_MARKET_DATA_MOCK || isTruthy(process.env.E2E_RUN);
  let wsSkipMap: Map<string, "ok" | "stale" | "unavailable"> | null = null;
  if (env.BINGX_WS_ENABLED && env.BINGX_WS_PAUSE_REST && !backfill && trigger === "schedule" && usesDefaultFetcher) {
    try {
      wsSkipMap = await buildWsSkipMap();
    } catch (error) {
      logWarn("Failed to load WS ingestion status", { error: String(error) });
    }
  }

  const summaries: BingxIngestSummary[] = [];
  const feedKeys = ["candles", "orderbook", "trades", "funding", "open_interest", "mark_index", "ticker"] as const;
  const feedRuns: Record<(typeof feedKeys)[number], { id: string } | null> = {
    candles: null,
    orderbook: null,
    trades: null,
    funding: null,
    open_interest: null,
    mark_index: null,
    ticker: null,
  };
  const feedTotals: Record<(typeof feedKeys)[number], { newCount: number; updatedCount: number; errorCount: number }> = {
    candles: { newCount: 0, updatedCount: 0, errorCount: 0 },
    orderbook: { newCount: 0, updatedCount: 0, errorCount: 0 },
    trades: { newCount: 0, updatedCount: 0, errorCount: 0 },
    funding: { newCount: 0, updatedCount: 0, errorCount: 0 },
    open_interest: { newCount: 0, updatedCount: 0, errorCount: 0 },
    mark_index: { newCount: 0, updatedCount: 0, errorCount: 0 },
    ticker: { newCount: 0, updatedCount: 0, errorCount: 0 },
  };

  const feedDecisions = await Promise.all(
    feedKeys.map((feed) => shouldRunIngestion({ sourceType: "bingx", sourceId: null, feed, trigger })),
  );
  for (const [index, feed] of feedKeys.entries()) {
    if (feedDecisions[index]?.allowed) {
      feedRuns[feed] = await createIngestionRun({
        source_type: "bingx",
        source_id: null,
        feed,
        trigger,
        status: "running",
      });
    } else {
      logInfo("BingX ingestion skipped", { feed, reason: feedDecisions[index]?.reason });
    }
  }

  let runError: Error | null = null;

  try {
    if (mockEnabled) {
      const seenAt = now.toISOString();
      for (const pair of pairs) {
        const summary: BingxIngestSummary = {
          pair,
          candlesInserted: 0,
          tradesInserted: 0,
          fundingInserted: 0,
          openInterestInserted: 0,
          markIndexInserted: 0,
          tickersInserted: 0,
        };
        const source = await getOrCreateSource("bingx", `bingx-${pair}`, `BingX ${pair}`);
        const syncRun = await createSyncRun(source.id);

        await Promise.all([
          recordDataSourceStatus({
            pair,
            sourceType: "bingx_candles",
            lastSeenAt: seenAt,
            freshnessThresholdSeconds: DEFAULT_THRESHOLDS.candles,
            now,
          }),
          recordDataSourceStatus({
            pair,
            sourceType: "bingx_orderbook",
            lastSeenAt: seenAt,
            freshnessThresholdSeconds: DEFAULT_THRESHOLDS.orderbook,
            now,
          }),
          recordDataSourceStatus({
            pair,
            sourceType: "bingx_trades",
            lastSeenAt: seenAt,
            freshnessThresholdSeconds: DEFAULT_THRESHOLDS.trades,
            now,
          }),
          recordDataSourceStatus({
            pair,
            sourceType: "bingx_funding",
            lastSeenAt: seenAt,
            freshnessThresholdSeconds: DEFAULT_THRESHOLDS.funding,
            now,
          }),
          recordDataSourceStatus({
            pair,
            sourceType: "bingx_open_interest",
            lastSeenAt: seenAt,
            freshnessThresholdSeconds: DEFAULT_THRESHOLDS.openInterest,
            now,
          }),
          recordDataSourceStatus({
            pair,
            sourceType: "bingx_mark_price",
            lastSeenAt: seenAt,
            freshnessThresholdSeconds: DEFAULT_THRESHOLDS.markIndex,
            now,
          }),
          recordDataSourceStatus({
            pair,
            sourceType: "bingx_index_price",
            lastSeenAt: seenAt,
            freshnessThresholdSeconds: DEFAULT_THRESHOLDS.markIndex,
            now,
          }),
          recordDataSourceStatus({
            pair,
            sourceType: "bingx_ticker",
            lastSeenAt: seenAt,
            freshnessThresholdSeconds: DEFAULT_THRESHOLDS.ticker,
            now,
          }),
        ]);

        await completeSyncRun(syncRun.id, {
          status: "succeeded",
          newCount: 0,
          updatedCount: 0,
          errorCount: 0,
        });

        summaries.push(summary);
        logInfo("BingX ingest complete (mock)", summary);
      }
      return summaries;
    }

    for (const pair of pairs) {
      const summary: BingxIngestSummary = {
        pair,
        candlesInserted: 0,
        tradesInserted: 0,
        fundingInserted: 0,
        openInterestInserted: 0,
        markIndexInserted: 0,
        tickersInserted: 0,
      };

      const source = await getOrCreateSource("bingx", `bingx-${pair}`, `BingX ${pair}`);
      const syncRun = await createSyncRun(source.id);

      try {
        if (feedRuns.candles) {
          if (shouldSkipRest(wsSkipMap, pair, "bingx_candles")) {
            logInfo("Skipping REST candles (WS healthy)", { pair });
          } else {
            const candleLastSeen = await ingestCandles({
              pair,
              intervals,
              baseUrl,
              fetcher,
              backfill,
              maxBatches,
              summary,
            });
            feedTotals.candles.newCount += summary.candlesInserted;
            await recordDataSourceStatus({
              pair,
              sourceType: "bingx_candles",
              lastSeenAt: candleLastSeen,
              freshnessThresholdSeconds: DEFAULT_THRESHOLDS.candles,
              now,
            });
          }
        }

        if (feedRuns.orderbook) {
          if (shouldSkipRest(wsSkipMap, pair, "bingx_orderbook")) {
            logInfo("Skipping REST orderbook (WS healthy)", { pair });
          } else {
            const orderbookSeen = await ingestOrderBook({ pair, baseUrl, fetcher });
            feedTotals.orderbook.newCount += orderbookSeen ? 1 : 0;
            await recordDataSourceStatus({
              pair,
              sourceType: "bingx_orderbook",
              lastSeenAt: orderbookSeen,
              freshnessThresholdSeconds: DEFAULT_THRESHOLDS.orderbook,
              now,
            });
          }
        }

        if (feedRuns.trades) {
          if (shouldSkipRest(wsSkipMap, pair, "bingx_trades")) {
            logInfo("Skipping REST trades (WS healthy)", { pair });
          } else {
            const tradeSeen = await ingestTrades({ pair, baseUrl, fetcher, summary, backfill, maxBatches });
            feedTotals.trades.newCount += summary.tradesInserted;
            await recordDataSourceStatus({
              pair,
              sourceType: "bingx_trades",
              lastSeenAt: tradeSeen,
              freshnessThresholdSeconds: DEFAULT_THRESHOLDS.trades,
              now,
            });
          }
        }

        if (feedRuns.funding) {
          const fundingSeen = await ingestFundingRates({ pair, baseUrl, fetcher, summary, backfill, maxBatches });
          feedTotals.funding.newCount += summary.fundingInserted;
          await recordDataSourceStatus({
            pair,
            sourceType: "bingx_funding",
            lastSeenAt: fundingSeen,
            freshnessThresholdSeconds: DEFAULT_THRESHOLDS.funding,
            now,
          });
        }

        if (feedRuns.open_interest) {
          const openInterestSeen = await ingestOpenInterest({ pair, baseUrl, fetcher, summary });
          feedTotals.open_interest.newCount += summary.openInterestInserted;
          await recordDataSourceStatus({
            pair,
            sourceType: "bingx_open_interest",
            lastSeenAt: openInterestSeen,
            freshnessThresholdSeconds: DEFAULT_THRESHOLDS.openInterest,
            now,
          });
        }

        if (feedRuns.mark_index) {
          const markIndexSeen = await ingestMarkIndex({ pair, baseUrl, fetcher, summary });
          feedTotals.mark_index.newCount += summary.markIndexInserted;
          await recordDataSourceStatus({
            pair,
            sourceType: "bingx_mark_price",
            lastSeenAt: markIndexSeen,
            freshnessThresholdSeconds: DEFAULT_THRESHOLDS.markIndex,
            now,
          });
          await recordDataSourceStatus({
            pair,
            sourceType: "bingx_index_price",
            lastSeenAt: markIndexSeen,
            freshnessThresholdSeconds: DEFAULT_THRESHOLDS.markIndex,
            now,
          });
        }

        if (feedRuns.ticker) {
          if (shouldSkipRest(wsSkipMap, pair, "bingx_ticker")) {
            logInfo("Skipping REST ticker (WS healthy)", { pair });
          } else {
            const tickerSeen = await ingestTicker({ pair, baseUrl, fetcher, summary });
            feedTotals.ticker.newCount += summary.tickersInserted;
            await recordDataSourceStatus({
              pair,
              sourceType: "bingx_ticker",
              lastSeenAt: tickerSeen,
              freshnessThresholdSeconds: DEFAULT_THRESHOLDS.ticker,
              now,
            });
          }
        }

        const totalInserted =
          summary.candlesInserted +
          summary.tradesInserted +
          summary.fundingInserted +
          summary.openInterestInserted +
          summary.markIndexInserted +
          summary.tickersInserted;
        await completeSyncRun(syncRun.id, {
          status: "succeeded",
          newCount: totalInserted,
          updatedCount: 0,
          errorCount: 0,
        });

        summaries.push(summary);
        logInfo("BingX ingest complete", summary);
      } catch (error) {
        await completeSyncRun(syncRun.id, {
          status: "failed",
          newCount: 0,
          updatedCount: 0,
          errorCount: 1,
          errorSummary: error instanceof Error ? error.message : "unknown_error",
        });
        throw error;
      }
    }
  } catch (error) {
    runError = error instanceof Error ? error : new Error(String(error));
    for (const feed of feedKeys) {
      feedTotals[feed].errorCount += 1;
    }
  } finally {
    for (const feed of feedKeys) {
      const run = feedRuns[feed];
      if (!run) continue;
      const totals = feedTotals[feed];
      await completeIngestionRun(run.id, {
        status: totals.errorCount > 0 ? "failed" : "succeeded",
        newCount: totals.newCount,
        updatedCount: totals.updatedCount,
        errorCount: totals.errorCount,
      });
    }
  }

  if (runError) {
    throw runError;
  }

  return summaries;
}

async function ingestCandles(params: {
  pair: TradingPair;
  intervals: string[];
  baseUrl: string;
  fetcher: typeof fetch;
  backfill: boolean;
  maxBatches: number;
  summary: BingxIngestSummary;
}) {
  const { pair, intervals, baseUrl, fetcher, backfill, maxBatches, summary } = params;
  let latestSeen: string | null = null;

  for (const interval of intervals) {
    const last = await getLatestCandleTime(pair, interval);
    let refreshParsed: ReturnType<typeof parseCandleRows> = [];
    const earliest = backfill ? await getEarliestCandleTime(pair, interval) : null;
    const intervalMs = parseIntervalMs(interval);
    const updateLatestSeen = (candidate: string | null | undefined) => {
      if (!candidate) return;
      if (!latestSeen || new Date(candidate).getTime() > new Date(latestSeen).getTime()) {
        latestSeen = candidate;
      }
    };
    updateLatestSeen(last ?? null);
    if (backfill) {
      try {
        const refreshCursor = last ? new Date(last).getTime() + intervalMs : undefined;
        const refreshPayload = await requestBingx(baseUrl, fetcher, "/openApi/swap/v3/quote/klines", {
          symbol: toBingxSymbol(pair),
          interval,
          limit: DEFAULT_LIMITS.candles,
          ...(refreshCursor ? { startTime: refreshCursor } : {}),
        });
        const refreshRows = normalizeList(refreshPayload);
        refreshParsed = parseCandleRows(refreshRows, pair, interval).sort(
          (a, b) => new Date(a.open_time).getTime() - new Date(b.open_time).getTime(),
        );
        if (refreshParsed.length > 0) {
          await upsertBingxCandles(refreshParsed);
          summary.candlesInserted += refreshParsed.length;
          updateLatestSeen(refreshParsed[refreshParsed.length - 1]?.close_time);
        }
      } catch (error) {
        logWarn("BingX candle refresh failed", { pair, interval, error: String(error) });
        await markSourceUnavailable(pair, "bingx_candles", DEFAULT_THRESHOLDS.candles);
        if (isSymbolMissingError(error)) {
          break;
        }
        continue;
      }
    }
    const earliestCursor = earliest ?? refreshParsed[0]?.open_time ?? null;
    let cursor = backfill
      ? (earliestCursor ? new Date(earliestCursor).getTime() - intervalMs : Date.now())
      : last
        ? new Date(last).getTime() + intervalMs
        : undefined;
    let lastCursor: number | null = null;
    let batches = 0;

    while (batches < maxBatches) {
      let payload: unknown;
      try {
        payload = await requestBingx(baseUrl, fetcher, "/openApi/swap/v3/quote/klines", {
          symbol: toBingxSymbol(pair),
          interval,
          limit: DEFAULT_LIMITS.candles,
          ...(cursor ? (backfill ? { endTime: cursor } : { startTime: cursor }) : {}),
        });
      } catch (error) {
        logWarn("BingX candle ingest failed", { pair, interval, error: String(error) });
        await markSourceUnavailable(pair, "bingx_candles", DEFAULT_THRESHOLDS.candles);
        if (isSymbolMissingError(error)) {
          break;
        }
        continue;
      }
      const rows = normalizeList(payload);
      const parsed = parseCandleRows(rows, pair, interval).sort(
        (a, b) => new Date(a.open_time).getTime() - new Date(b.open_time).getTime(),
      );
      if (parsed.length === 0) {
        break;
      }
      await upsertBingxCandles(parsed);
      summary.candlesInserted += parsed.length;
      const firstRow = parsed[0];
      const lastRow = parsed[parsed.length - 1];
      updateLatestSeen(lastRow?.close_time);
      if (backfill) {
        const nextCursor = new Date(firstRow.open_time).getTime() - intervalMs;
        if (!Number.isFinite(nextCursor) || nextCursor <= 0) {
          break;
        }
        if (lastCursor !== null && nextCursor >= lastCursor) {
          logWarn("BingX candle backfill cursor stalled", { pair, interval, cursor: lastCursor, nextCursor });
          break;
        }
        lastCursor = nextCursor;
        cursor = nextCursor;
      } else {
        const nextCursor = new Date(lastRow.open_time).getTime() + intervalMs;
        if (!Number.isFinite(nextCursor)) {
          break;
        }
        if (lastCursor !== null && nextCursor <= lastCursor) {
          logWarn("BingX candle cursor stalled", { pair, interval, cursor: lastCursor, nextCursor });
          break;
        }
        lastCursor = nextCursor;
        cursor = nextCursor;
      }
      batches += 1;
      if (!backfill) {
        break;
      }
    }
  }

  return latestSeen;
}

export async function backfillBingxCandleWindow(params: {
  pair: TradingPair;
  interval: string;
  startTime: string;
  endTime: string;
  maxBatches?: number;
  baseUrl?: string;
  fetcher?: typeof fetch;
}) {
  const env = loadEnv();
  const baseUrl = params.baseUrl ?? env.BINGX_BASE_URL ?? DEFAULT_BASE_URL;
  const fetcher = params.fetcher ?? fetch;
  const startMs = new Date(params.startTime).getTime();
  const endMs = new Date(params.endTime).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }
  const intervalMs = parseIntervalMs(params.interval);
  const maxBatches = params.maxBatches ?? 10;
  let cursor = startMs;
  let batches = 0;
  let inserted = 0;

  while (cursor <= endMs && batches < maxBatches) {
    const payload = await requestBingx(baseUrl, fetcher, "/openApi/swap/v3/quote/klines", {
      symbol: toBingxSymbol(params.pair),
      interval: params.interval,
      limit: DEFAULT_LIMITS.candles,
      startTime: cursor,
      endTime: endMs,
    });
    const rows = normalizeList(payload);
    const parsed = parseCandleRows(rows, params.pair, params.interval).sort(
      (a, b) => new Date(a.open_time).getTime() - new Date(b.open_time).getTime(),
    );
    if (parsed.length === 0) {
      break;
    }
    await upsertBingxCandles(parsed);
    inserted += parsed.length;
    const lastRow = parsed[parsed.length - 1];
    const nextCursor = new Date(lastRow.open_time).getTime() + intervalMs;
    if (!Number.isFinite(nextCursor) || nextCursor <= cursor) {
      break;
    }
    cursor = nextCursor;
    batches += 1;
  }

  return inserted;
}

async function ingestOrderBook(params: { pair: TradingPair; baseUrl: string; fetcher: typeof fetch }) {
  const { pair, baseUrl, fetcher } = params;
  try {
    const payload = await requestBingx(baseUrl, fetcher, "/openApi/swap/v2/quote/depth", {
      symbol: toBingxSymbol(pair),
      limit: 50,
    });
    const bids = payload?.bids ?? payload?.data?.bids ?? [];
    const asks = payload?.asks ?? payload?.data?.asks ?? [];
    const capturedAt = new Date().toISOString();
    await insertOrderBookSnapshot({
      pair,
      captured_at: capturedAt,
      depth_level: Math.max(bids.length, asks.length) || 0,
      bids,
      asks,
    });
    return capturedAt;
  } catch (error) {
    logWarn("BingX orderbook ingest failed", { pair, error: String(error) });
    await markSourceUnavailable(pair, "bingx_orderbook", DEFAULT_THRESHOLDS.orderbook);
    return null;
  }
}

async function ingestTrades(params: {
  pair: TradingPair;
  baseUrl: string;
  fetcher: typeof fetch;
  summary: BingxIngestSummary;
  backfill: boolean;
  maxBatches: number;
}) {
  const { pair, baseUrl, fetcher, summary, backfill, maxBatches } = params;
  const latestKnown = await getLatestTradeTime(pair);
  const seenIds = new Set<string>();
  const batchesMax = backfill ? Math.min(maxBatches, MAX_TRADES_BATCHES_PER_RUN) : 1;
  let batches = 0;
  try {
    while (batches < batchesMax) {
      const payload = await requestBingx(baseUrl, fetcher, "/openApi/swap/v2/quote/trades", {
        symbol: toBingxSymbol(pair),
        limit: DEFAULT_LIMITS.trades,
      });
      const rows = normalizeList(payload);
      let parsed = parseTradeRows(rows, pair).sort(
        (a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime(),
      );
      if (parsed.length === 0) {
        break;
      }
      if (latestKnown && !backfill) {
        const latestMs = new Date(latestKnown).getTime();
        parsed = parsed.filter((row) => new Date(row.executed_at).getTime() > latestMs);
      }
      const unique = parsed.filter((row) => {
        if (seenIds.has(row.trade_id)) return false;
        seenIds.add(row.trade_id);
        return true;
      });
      if (unique.length === 0) {
        break;
      }
      await upsertBingxTrades(unique);
      summary.tradesInserted += unique.length;
      batches += 1;
    }
  } catch (error) {
    logWarn("BingX trades ingest failed", { pair, error: String(error) });
    await markSourceUnavailable(pair, "bingx_trades", DEFAULT_THRESHOLDS.trades);
  }
  return await getLatestTradeTime(pair);
}

async function ingestFundingRates(params: {
  pair: TradingPair;
  baseUrl: string;
  fetcher: typeof fetch;
  summary: BingxIngestSummary;
  backfill: boolean;
  maxBatches: number;
}) {
  const { pair, baseUrl, fetcher, summary, backfill, maxBatches } = params;
  const latestKnown = await getLatestFundingTime(pair);
  const earliestKnown = backfill ? await getEarliestFundingTime(pair) : null;
  let cursorEnd = backfill
    ? (earliestKnown ? new Date(earliestKnown).getTime() - 1 : Date.now())
    : Date.now();
  let batches = 0;
  let latestSeen: string | null = latestKnown;
  try {
    while (batches < maxBatches) {
      const endTime = cursorEnd;
      const startTime = Math.max(0, endTime - FUNDING_INTERVAL_MS * DEFAULT_LIMITS.funding);
      const payload = await requestBingx(baseUrl, fetcher, "/openApi/swap/v2/quote/fundingRate", {
        symbol: toBingxSymbol(pair),
        limit: DEFAULT_LIMITS.funding,
        ...(backfill ? { startTime, endTime } : {}),
      });
      const rows = normalizeList(payload);
      let parsed = parseFundingRows(rows, pair).sort(
        (a, b) => new Date(a.funding_time).getTime() - new Date(b.funding_time).getTime(),
      );
      if (parsed.length === 0) {
        break;
      }
      if (latestKnown && !backfill) {
        const latestMs = new Date(latestKnown).getTime();
        parsed = parsed.filter((row) => new Date(row.funding_time).getTime() > latestMs);
      }
      if (parsed.length > 0) {
        await upsertBingxFundingRates(parsed);
        summary.fundingInserted += parsed.length;
        latestSeen = parsed[parsed.length - 1]?.funding_time ?? latestSeen;
      }
      if (!backfill) {
        break;
      }
      const oldest = parsed[0];
      const nextCursor = oldest ? new Date(oldest.funding_time).getTime() - 1 : null;
      if (!nextCursor || !Number.isFinite(nextCursor) || nextCursor >= cursorEnd) {
        break;
      }
      cursorEnd = nextCursor;
      batches += 1;
    }
  } catch (error) {
    logWarn("BingX funding ingest failed", { pair, error: String(error) });
    await markSourceUnavailable(pair, "bingx_funding", DEFAULT_THRESHOLDS.funding);
  }
  return latestSeen ?? (await getLatestFundingTime(pair));
}

async function ingestOpenInterest(params: {
  pair: TradingPair;
  baseUrl: string;
  fetcher: typeof fetch;
  summary: BingxIngestSummary;
}) {
  const { pair, baseUrl, fetcher, summary } = params;
  try {
    const payload = await requestBingx(baseUrl, fetcher, "/openApi/swap/v2/quote/openInterest", {
      symbol: toBingxSymbol(pair),
    });
    const rows = normalizeList(payload);
    const parsed = parseOpenInterestRows(rows, pair);
    if (parsed.length > 0) {
      await upsertBingxOpenInterest(parsed);
      summary.openInterestInserted += parsed.length;
      return parsed[parsed.length - 1].captured_at;
    }
  } catch (error) {
    logWarn("BingX open interest ingest failed", { pair, error: String(error) });
    await markSourceUnavailable(pair, "bingx_open_interest", DEFAULT_THRESHOLDS.openInterest);
  }
  return await getLatestOpenInterestTime(pair);
}

async function ingestMarkIndex(params: {
  pair: TradingPair;
  baseUrl: string;
  fetcher: typeof fetch;
  summary: BingxIngestSummary;
}) {
  const { pair, baseUrl, fetcher, summary } = params;
  try {
    const payload = await requestBingx(baseUrl, fetcher, "/openApi/swap/v2/quote/premiumIndex", {
      symbol: toBingxSymbol(pair),
    });
    const rows = normalizeList(payload);
    const parsed = parseMarkIndexRows(rows, pair);
    if (parsed.length > 0) {
      await upsertBingxMarkIndexPrices(parsed);
      summary.markIndexInserted += parsed.length;
      return parsed[parsed.length - 1].captured_at;
    }
  } catch (error) {
    logWarn("BingX mark/index ingest failed", { pair, error: String(error) });
    await markSourceUnavailable(pair, "bingx_mark_price", DEFAULT_THRESHOLDS.markIndex);
    await markSourceUnavailable(pair, "bingx_index_price", DEFAULT_THRESHOLDS.markIndex);
  }
  return await getLatestMarkIndexTime(pair);
}

async function ingestTicker(params: { pair: TradingPair; baseUrl: string; fetcher: typeof fetch; summary: BingxIngestSummary }) {
  const { pair, baseUrl, fetcher, summary } = params;
  try {
    const payload = await requestBingx(baseUrl, fetcher, "/openApi/swap/v2/quote/ticker", {
      symbol: toBingxSymbol(pair),
    });
    const rows = normalizeList(payload);
    const parsed = parseTickerRows(rows, pair);
    if (parsed.length > 0) {
      await upsertBingxTickers(parsed);
      summary.tickersInserted += parsed.length;
      return parsed[parsed.length - 1].captured_at;
    }
  } catch (error) {
    logWarn("BingX ticker ingest failed", { pair, error: String(error) });
    await markSourceUnavailable(pair, "bingx_ticker", DEFAULT_THRESHOLDS.ticker);
  }
  return await getLatestTickerTime(pair);
}

type BingxResponse = {
  code?: number;
  msg?: string;
  data?: unknown;
};

async function requestBingx(
  baseUrl: string,
  fetcher: typeof fetch,
  path: string,
  params: Record<string, string | number>,
) {
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetcher(url, { method: "GET" });
    let body: BingxResponse | undefined;
    try {
      body = (await response.json()) as BingxResponse;
    } catch {
      body = undefined;
    }

    if (response.ok && (!body?.code || body.code === 0)) {
      return body?.data ?? body ?? {};
    }

    const message = body?.msg ?? response.statusText;
    const rateLimited = response.status === 429 || message.toLowerCase().includes("rate");
    if (rateLimited && attempt < maxRetries) {
      await sleep(500 * (attempt + 1));
      continue;
    }
    throw new Error(`BingX request failed (${response.status}): ${message}`);
  }
  return {};
}

function normalizeList(payload: unknown): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload === "object" && payload !== null) {
    const data = payload as { list?: unknown; data?: unknown; rows?: unknown };
    if (Array.isArray(data.list)) return data.list;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.rows)) return data.rows;
    if ("code" in data || "msg" in data) return [];
    return [payload];
  }
  return [];
}

function parseCandleRows(rows: any[], pair: TradingPair, interval: string) {
  const parsed: Array<{
    pair: TradingPair;
    interval: string;
    open_time: string;
    close_time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    quote_volume?: number | null;
  }> = [];

  const intervalMs = parseIntervalMs(interval);

  for (const row of rows) {
    const openTime = toIso(row?.openTime ?? row?.open_time ?? row?.time ?? row?.[0]);
    const closeTime =
      toIso(row?.closeTime ?? row?.close_time ?? row?.[6]) ??
      (openTime ? new Date(new Date(openTime).getTime() + intervalMs).toISOString() : null);
    if (!openTime || !closeTime) continue;
    const open = parseNumber(row?.open ?? row?.[1]);
    const high = parseNumber(row?.high ?? row?.[2]);
    const low = parseNumber(row?.low ?? row?.[3]);
    const close = parseNumber(row?.close ?? row?.[4]);
    const volume = parseNumber(row?.volume ?? row?.[5]);
    const quoteVolume = parseOptionalNumber(row?.quoteVolume ?? row?.quote_volume ?? row?.[7]);
    parsed.push({
      pair,
      interval,
      open_time: openTime,
      close_time: closeTime,
      open,
      high,
      low,
      close,
      volume,
      quote_volume: quoteVolume,
    });
  }

  return parsed;
}

function parseTradeRows(rows: any[], pair: TradingPair) {
  const parsed: Array<{
    pair: TradingPair;
    trade_id: string;
    price: number;
    quantity: number;
    side: "buy" | "sell";
    executed_at: string;
  }> = [];

  for (const row of rows) {
    const tradeId = String(row?.tradeId ?? row?.id ?? row?.fillId ?? row?.[0] ?? "");
    if (!tradeId) continue;
    const price = parseNumber(row?.price ?? row?.p ?? row?.[1]);
    const quantity = parseNumber(row?.qty ?? row?.quantity ?? row?.[2]);
    let side: "buy" | "sell";
    if (row?.side) {
      const sideRaw = String(row.side).toLowerCase();
      side = sideRaw === "sell" ? "sell" : "buy";
    } else if (typeof row?.isBuyerMaker === "boolean") {
      side = row.isBuyerMaker ? "sell" : "buy";
    } else {
      side = "buy";
    }
    const executedAt = toIso(row?.time ?? row?.ts ?? row?.executed_at ?? row?.[4]) ?? new Date().toISOString();
    parsed.push({ pair, trade_id: tradeId, price, quantity, side, executed_at: executedAt });
  }

  return parsed;
}

function parseFundingRows(rows: any[], pair: TradingPair) {
  return rows
    .map((row) => {
      const fundingRate = parseNumber(row?.fundingRate ?? row?.funding_rate ?? row?.[1] ?? row?.rate);
      const fundingTime = toIso(row?.fundingTime ?? row?.funding_time ?? row?.[0]);
      if (!fundingTime) return null;
      return {
        pair,
        funding_rate: fundingRate,
        funding_time: fundingTime,
      };
    })
    .filter(Boolean) as Array<{ pair: TradingPair; funding_rate: number; funding_time: string }>;
}

function parseOpenInterestRows(rows: any[], pair: TradingPair) {
  if (rows.length === 0) return [];
  return rows
    .map((row) => {
      const openInterest = parseNumber(row?.openInterest ?? row?.open_interest ?? row?.value);
      const capturedAt = toIso(row?.timestamp ?? row?.time ?? row?.captured_at) ?? new Date().toISOString();
      return {
        pair,
        open_interest: openInterest,
        captured_at: capturedAt,
      };
    })
    .filter(Boolean) as Array<{ pair: TradingPair; open_interest: number; captured_at: string }>;
}

function parseMarkIndexRows(rows: any[], pair: TradingPair) {
  if (rows.length === 0) return [];
  return rows
    .map((row) => {
      const markPrice = parseNumber(row?.markPrice ?? row?.mark_price ?? row?.mark);
      const indexPrice = parseNumber(row?.indexPrice ?? row?.index_price ?? row?.index);
      const capturedAt = toIso(row?.timestamp ?? row?.time ?? row?.captured_at) ?? new Date().toISOString();
      return {
        pair,
        mark_price: markPrice,
        index_price: indexPrice,
        captured_at: capturedAt,
      };
    })
    .filter(Boolean) as Array<{ pair: TradingPair; mark_price: number; index_price: number; captured_at: string }>;
}

function parseTickerRows(rows: any[], pair: TradingPair) {
  if (rows.length === 0) return [];
  return rows
    .map((row) => {
      const lastPrice = parseNumber(row?.lastPrice ?? row?.last_price ?? row?.last);
      const volume24h = parseOptionalNumber(row?.volume24h ?? row?.volume_24h ?? row?.volume);
      const change24h = parseOptionalNumber(row?.priceChange24h ?? row?.price_change_24h ?? row?.change);
      const capturedAt = toIso(row?.timestamp ?? row?.time ?? row?.captured_at) ?? new Date().toISOString();
      return {
        pair,
        last_price: lastPrice,
        volume_24h: volume24h,
        price_change_24h: change24h,
        captured_at: capturedAt,
      };
    })
    .filter(Boolean) as Array<{
    pair: TradingPair;
    last_price: number;
    volume_24h?: number | null;
    price_change_24h?: number | null;
    captured_at: string;
  }>;
}

function parseIntervalMs(interval: string) {
  const match = interval.match(/^(\d+)([mhdwM])$/);
  if (!match) return 60_000;
  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  if (unit === "m") return value * 60_000;
  if (unit === "h") return value * 3_600_000;
  if (unit === "d") return value * 86_400_000;
  if (unit === "w") return value * 604_800_000;
  if (unit === "M") return value * 2_592_000_000;
  return value * 60_000;
}

function toIso(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (typeof value === "number") {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
}

function parseNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function isSymbolMissingError(error: unknown) {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("not exist");
}

function parseIntervals(value: string | undefined) {
  if (!value) return null;
  const intervals = value
    .split(",")
    .map((interval) => interval.trim())
    .filter(Boolean);
  return intervals.length > 0 ? intervals : null;
}

async function buildWsSkipMap() {
  const statuses = await listDataSourceStatusWithConfig();
  const map = new Map<string, "ok" | "stale" | "unavailable">();
  for (const status of statuses) {
    map.set(`${status.pair}:${status.sourceType}`, status.status);
  }
  return map;
}

function shouldSkipRest(
  wsSkipMap: Map<string, "ok" | "stale" | "unavailable"> | null,
  pair: TradingPair,
  sourceType: string,
) {
  if (!wsSkipMap) return false;
  return wsSkipMap.get(`${pair}:${sourceType}`) === "ok";
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
