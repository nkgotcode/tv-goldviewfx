import { createHash, randomUUID } from "node:crypto";
import { insertDatasetVersion } from "../db/repositories/dataset_versions";
import { insertDatasetLineage } from "../db/repositories/dataset_lineage";
import { listFeatureSetVersions } from "../db/repositories/feature_set_versions";
import { listIngestionRuns } from "../db/repositories/ingestion_runs";
import { listBingxCandles } from "../db/repositories/bingx_market_data/candles";
import { listBingxFundingRates } from "../db/repositories/bingx_market_data/funding_rates";
import { listBingxMarkIndexPrices } from "../db/repositories/bingx_market_data/mark_index_prices";
import { listBingxOpenInterest } from "../db/repositories/bingx_market_data/open_interest";
import { listBingxTickers } from "../db/repositories/bingx_market_data/tickers";
import { loadEnv } from "../config/env";
import { fromBingxSymbol, getSupportedPairs, normalizePairToken, toBingxSymbol } from "../config/market_catalog";
import { loadRlServiceConfig } from "../config/rl_service";
import { rlServiceClient } from "../rl/client";
import type { DatasetPreviewRequest, DatasetPreviewResponse } from "../types/rl";
import type { TradingPair } from "../types/rl";
import { getFeatureSchemaFingerprint, getFeatureSetConfigById, resolveFeatureSetVersion } from "./feature_set_service";
import { ensureFeatureSnapshots } from "./feature_snapshot_service";
import { logWarn } from "./logger";

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

type CandleRow = {
  open_time: string;
  close_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type FundingRateRow = {
  funding_time: string;
  funding_rate: number;
};

type OpenInterestRow = {
  captured_at: string;
  open_interest: number;
};

type MarkIndexRow = {
  captured_at: string;
  mark_price: number;
  index_price: number;
};

type TickerRow = {
  captured_at: string;
  last_price: number;
  volume_24h?: number | null;
  price_change_24h?: number | null;
};

type DatasetDataSourceEntry = {
  source: string;
  pairs: string[];
  rows: number;
};

export type DatasetFeatureProvenance = {
  requestedPair: string;
  requestedBingxSymbol: string;
  resolvedPair: string;
  resolvedBingxSymbol: string;
  candidatePairs: string[];
  interval: string;
  periodStart: string;
  periodEnd: string;
  rowCounts: {
    candles: number;
    funding: number;
    openInterest: number;
    markIndex: number;
    tickers: number;
    featureSnapshots: number;
  };
  dataSources: DatasetDataSourceEntry[];
  dataFields: string[];
  candlesOrigin: "stored" | "live" | "stored+live" | "synthetic";
  liveFetch: {
    attemptedSymbols: string[];
    usedSymbol: string | null;
    usedRangeStart: string | null;
    usedRangeEnd: string | null;
  };
};

export type DatasetFeatureBuildResult = {
  features: Array<Record<string, number | string>>;
  provenance: DatasetFeatureProvenance;
};

function uniqueValues(values: string[]) {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const token = normalizePairToken(value);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    output.push(value);
  }
  return output;
}

function resolveCandidatePairs(requestedPair: string) {
  const requestedSymbol = toBingxSymbol(requestedPair);
  const requestedToken = normalizePairToken(requestedSymbol);
  const aliasPairs = getSupportedPairs().filter((pair) => normalizePairToken(toBingxSymbol(pair)) === requestedToken);
  return uniqueValues([requestedPair, ...aliasPairs]);
}

function mergeCandles(...groups: CandleRow[][]) {
  const merged = new Map<string, CandleRow>();
  for (const group of groups) {
    for (const candle of group) {
      if (!candle?.open_time) continue;
      merged.set(candle.open_time, candle);
    }
  }
  return Array.from(merged.values()).sort(
    (a, b) => new Date(a.open_time).getTime() - new Date(b.open_time).getTime(),
  );
}

function normalizeTimeSeries<T extends Record<string, unknown>>(rows: T[], timeField: keyof T) {
  return [...rows]
    .map((row) => ({ row, ts: new Date(String(row[timeField] ?? "")).getTime() }))
    .filter((item) => Number.isFinite(item.ts))
    .sort((a, b) => a.ts - b.ts);
}

function percentDelta(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return 0;
  return (current - previous) / Math.abs(previous);
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

async function fetchBingxCandlesDirect(input: DatasetPreviewRequest) {
  const env = loadEnv();
  const baseUrl = env.BINGX_BASE_URL ?? "https://open-api.bingx.com";
  const startMs = new Date(input.startAt).getTime();
  const endMs = new Date(input.endAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return { rows: [] as CandleRow[], usedSymbol: null, attemptedSymbols: [] as string[] };
  }
  const symbols = resolveCandidatePairs(input.pair).map((pair) => toBingxSymbol(pair));
  const attemptedSymbols: string[] = [];

  let lastError: Error | null = null;
  for (const symbol of symbols) {
    attemptedSymbols.push(symbol);
    const url = new URL(`${baseUrl}/openApi/swap/v3/quote/klines`);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", input.interval);
    url.searchParams.set("startTime", String(startMs));
    url.searchParams.set("endTime", String(endMs));
    url.searchParams.set("limit", "1000");
    const response = await fetch(url, { method: "GET" });
    let body: any = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok || (body?.code && body.code !== 0)) {
      const message = body?.msg ?? response.statusText;
      lastError = new Error(`BingX request failed (${response.status}): ${message}`);
      if (message.toLowerCase().includes("not exist")) {
        continue;
      }
      throw lastError;
    }
    const rows = normalizeList(body?.data ?? body);
    const intervalMs = parseIntervalMs(input.interval);
    return {
      rows: rows
      .map((row) => {
        const openTime = toIso(row?.openTime ?? row?.open_time ?? row?.time ?? row?.[0]);
        const closeTime =
          toIso(row?.closeTime ?? row?.close_time ?? row?.[6]) ??
          (openTime ? new Date(new Date(openTime).getTime() + intervalMs).toISOString() : null);
        if (!openTime || !closeTime) return null;
        return {
          open_time: openTime,
          close_time: closeTime,
          open: parseNumber(row?.open ?? row?.[1]),
          high: parseNumber(row?.high ?? row?.[2]),
          low: parseNumber(row?.low ?? row?.[3]),
          close: parseNumber(row?.close ?? row?.[4]),
          volume: parseNumber(row?.volume ?? row?.[5]),
        };
      })
      .filter((row): row is CandleRow => row !== null),
      usedSymbol: symbol,
      attemptedSymbols,
    };
  }

  if (lastError) {
    throw lastError;
  }
  return { rows: [], usedSymbol: null, attemptedSymbols };
}

type DatasetPreviewVersion = {
  id: string;
  pair: TradingPair;
  interval: string;
  start_at: string;
  end_at: string;
  checksum: string;
  dataset_hash?: string | null;
  window_size?: number | null;
  stride?: number | null;
  feature_set_version_id?: string | null;
  feature_schema_fingerprint?: string | null;
};

function buildMockPreview(input: DatasetPreviewRequest, featureSetVersionId?: string | null): DatasetPreviewResponse {
  const payload = {
    pair: input.pair,
    interval: input.interval,
    start_at: input.startAt,
    end_at: input.endAt,
    feature_set_version_id: featureSetVersionId ?? null,
    feature_schema_fingerprint: input.featureSchemaFingerprint ?? null,
    window_size: input.windowSize ?? 30,
    stride: input.stride ?? 1,
  };
  const checksum = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const datasetHash = checksum;
  return {
    version: {
      id: randomUUID(),
      pair: input.pair,
      interval: input.interval,
      startAt: input.startAt,
      endAt: input.endAt,
      checksum,
      datasetHash,
      featureSetVersionId: featureSetVersionId ?? null,
      featureSchemaFingerprint: input.featureSchemaFingerprint ?? null,
      windowSize: input.windowSize ?? 30,
      stride: input.stride ?? 1,
      createdAt: new Date().toISOString(),
    },
    windowCount: Math.max(0, Math.floor((new Date(input.endAt).getTime() - new Date(input.startAt).getTime()) / 60000)),
  };
}

function normalizePreviewVersion(payload: DatasetPreviewResponse["version"] & Record<string, unknown>): DatasetPreviewVersion {
  const datasetHash = payload.dataset_hash ?? payload.datasetHash ?? payload.checksum ?? null;
  return {
    id: String(payload.id ?? payload.datasetId ?? randomUUID()),
    pair: payload.pair as TradingPair,
    interval: String(payload.interval ?? "1m"),
    start_at: String(payload.start_at ?? payload.startAt),
    end_at: String(payload.end_at ?? payload.endAt),
    checksum: String(payload.checksum),
    dataset_hash: datasetHash ? String(datasetHash) : null,
    window_size: payload.window_size ? Number(payload.window_size) : payload.windowSize ? Number(payload.windowSize) : null,
    stride: payload.stride ? Number(payload.stride) : null,
    feature_set_version_id: (payload.feature_set_version_id ?? payload.featureSetVersionId ?? null) as string | null,
    feature_schema_fingerprint: (payload.feature_schema_fingerprint ?? payload.featureSchemaFingerprint ?? null) as
      | string
      | null,
  };
}

async function ensureFeatureSetVersion() {
  const existing = await listFeatureSetVersions();
  if (existing.length > 0) {
    return existing[0];
  }
  return resolveFeatureSetVersion({ includeNews: true, includeOcr: false });
}

async function latestSourceRunIds() {
  const ids: string[] = [];
  for (const sourceType of ["tradingview", "telegram"]) {
    const { data } = await listIngestionRuns({ sourceType, page: 1, pageSize: 1 });
    if (data[0]?.id) {
      ids.push(data[0].id);
    }
  }
  return ids;
}

function buildSyntheticFeatures(input: DatasetPreviewRequest) {
  const intervalMs = parseIntervalMs(input.interval);
  const start = new Date(input.startAt).getTime();
  const end = new Date(input.endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return [];
  }
  const count = Math.max(0, Math.floor((end - start) / intervalMs));
  const features = [];
  for (let idx = 0; idx < count; idx += 1) {
    const timestamp = new Date(start + idx * intervalMs).toISOString();
    const price = 2300 + idx * 0.2;
    features.push({
      timestamp,
      open: price,
      high: price + 0.4,
      low: price - 0.4,
      close: price + 0.2,
      volume: 100 + idx,
    });
  }
  return features;
}

function dedupeByTimestamp<T extends Record<string, unknown>>(rows: T[], timeField: keyof T) {
  const deduped = new Map<string, T>();
  for (const row of rows) {
    const key = String(row[timeField] ?? "");
    if (!key) continue;
    deduped.set(key, row);
  }
  return Array.from(deduped.values());
}

function resolvePairFromSymbol(symbol: string, fallback: string) {
  return fromBingxSymbol(symbol) ?? fallback;
}

export async function buildDatasetFeaturesWithProvenance(input: DatasetPreviewRequest): Promise<DatasetFeatureBuildResult> {
  const intervalMs = parseIntervalMs(input.interval);
  const startMs = new Date(input.startAt).getTime();
  const endMs = new Date(input.endAt).getTime();
  const maxLiveWindowMs = intervalMs * 1000;
  const allowLiveFetch = !["1", "true", "yes", "on"].includes(
    (process.env.BINGX_MARKET_DATA_MOCK ?? "").toLowerCase(),
  );
  const candidatePairs = resolveCandidatePairs(input.pair);
  const requestedBingxSymbol = toBingxSymbol(input.pair);

  const candleResults = await Promise.all(
    candidatePairs.map(async (candidatePair) => {
      try {
        const rows = await listBingxCandles({
          pair: candidatePair,
          interval: input.interval,
          start: input.startAt,
          end: input.endAt,
        });
        return { pair: candidatePair, rows: rows as CandleRow[] };
      } catch (error) {
        logWarn("BingX candle query failed; continuing with alias candidates", {
          requestedPair: input.pair,
          candidatePair,
          interval: input.interval,
          error: String(error),
        });
        return { pair: candidatePair, rows: [] as CandleRow[] };
      }
    }),
  );
  const convexCandles = mergeCandles(...candleResults.map((result) => result.rows));
  const storedPairsUsed = candleResults.filter((result) => result.rows.length > 0).map((result) => result.pair);

  const liveCandles: CandleRow[] = [];
  let liveUsedSymbol: string | null = null;
  const liveAttemptedSymbols = new Set<string>();
  let liveRangeStart: string | null = null;
  let liveRangeEnd: string | null = null;

  const requestLiveRange = async (rangeStartMs: number, rangeEndMs: number, reason: string) => {
    if (!allowLiveFetch) {
      return;
    }
    if (!Number.isFinite(rangeStartMs) || !Number.isFinite(rangeEndMs) || rangeEndMs <= rangeStartMs) {
      return;
    }
    const maxStart = Math.max(rangeStartMs, rangeEndMs - maxLiveWindowMs);
    if (rangeEndMs - rangeStartMs > maxLiveWindowMs) {
      logWarn("BingX live candle fetch limited to 1000 bars", {
        pair: input.pair,
        interval: input.interval,
        reason,
        requestedStart: new Date(rangeStartMs).toISOString(),
        requestedEnd: new Date(rangeEndMs).toISOString(),
      });
    }
    try {
      const response = await fetchBingxCandlesDirect({
        ...input,
        startAt: new Date(maxStart).toISOString(),
        endAt: new Date(rangeEndMs).toISOString(),
      });
      for (const symbol of response.attemptedSymbols) {
        liveAttemptedSymbols.add(symbol);
      }
      if (response.usedSymbol) {
        liveUsedSymbol = response.usedSymbol;
        liveRangeStart = new Date(maxStart).toISOString();
        liveRangeEnd = new Date(rangeEndMs).toISOString();
      }
      liveCandles.push(...response.rows);
    } catch (error) {
      logWarn("BingX live candle fetch failed", {
        pair: input.pair,
        interval: input.interval,
        reason,
        error: String(error),
      });
    }
  };

  if (convexCandles.length === 0) {
    await requestLiveRange(startMs, endMs, "convex_empty");
  } else {
    const sortedConvex = [...convexCandles].sort(
      (a, b) => new Date(a.open_time).getTime() - new Date(b.open_time).getTime(),
    );
    const earliestMs = new Date(sortedConvex[0]?.open_time ?? input.startAt).getTime();
    const latestMs = new Date(sortedConvex[sortedConvex.length - 1]?.open_time ?? input.endAt).getTime();

    if (Number.isFinite(earliestMs) && earliestMs - startMs > intervalMs) {
      await requestLiveRange(startMs, Math.min(earliestMs - intervalMs, endMs), "convex_missing_head");
    }
    if (Number.isFinite(latestMs) && endMs - latestMs > intervalMs) {
      await requestLiveRange(Math.max(latestMs + intervalMs, endMs - maxLiveWindowMs), endMs, "convex_missing_tail");
    }
  }

  const candles = mergeCandles(convexCandles, liveCandles);
  const resolvedBingxSymbol = liveUsedSymbol ?? requestedBingxSymbol;
  const resolvedPair =
    storedPairsUsed[0] ??
    resolvePairFromSymbol(resolvedBingxSymbol, candidatePairs[0] ?? input.pair);
  let candlesOrigin: DatasetFeatureProvenance["candlesOrigin"] = "stored";
  if (convexCandles.length > 0 && liveCandles.length > 0) candlesOrigin = "stored+live";
  if (convexCandles.length === 0 && liveCandles.length > 0) candlesOrigin = "live";

  if (candles.length === 0) {
    const config = loadRlServiceConfig();
    const allowSynthetic = config.mock || ["1", "true", "yes", "on"].includes((process.env.BINGX_MARKET_DATA_MOCK ?? "").toLowerCase());
    if (allowSynthetic) {
      const syntheticFeatures = buildSyntheticFeatures(input);
      const dataFields = syntheticFeatures.length === 0 ? [] : Object.keys(syntheticFeatures[0] ?? {}).sort();
      return {
        features: syntheticFeatures,
        provenance: {
          requestedPair: input.pair,
          requestedBingxSymbol,
          resolvedPair,
          resolvedBingxSymbol,
          candidatePairs,
          interval: input.interval,
          periodStart: input.startAt,
          periodEnd: input.endAt,
          rowCounts: {
            candles: syntheticFeatures.length,
            funding: 0,
            openInterest: 0,
            markIndex: 0,
            tickers: 0,
            featureSnapshots: 0,
          },
          dataSources: [{ source: "synthetic_candles", pairs: [resolvedPair], rows: syntheticFeatures.length }],
          dataFields,
          candlesOrigin: "synthetic",
          liveFetch: {
            attemptedSymbols: Array.from(liveAttemptedSymbols),
            usedSymbol: liveUsedSymbol,
            usedRangeStart: liveRangeStart,
            usedRangeEnd: liveRangeEnd,
          },
        },
      };
    }
  }
  if (candles.length === 0) {
    return {
      features: [],
      provenance: {
        requestedPair: input.pair,
        requestedBingxSymbol,
        resolvedPair,
        resolvedBingxSymbol,
        candidatePairs,
        interval: input.interval,
        periodStart: input.startAt,
        periodEnd: input.endAt,
        rowCounts: {
          candles: 0,
          funding: 0,
          openInterest: 0,
          markIndex: 0,
          tickers: 0,
          featureSnapshots: 0,
        },
        dataSources: [],
        dataFields: [],
        candlesOrigin,
        liveFetch: {
          attemptedSymbols: Array.from(liveAttemptedSymbols),
          usedSymbol: liveUsedSymbol,
          usedRangeStart: liveRangeStart,
          usedRangeEnd: liveRangeEnd,
        },
      },
    };
  }

  const [fundingResults, openInterestResults, markIndexResults, tickerResults] = await Promise.all([
    Promise.all(
      candidatePairs.map(async (candidatePair) => {
        try {
          const rows = await listBingxFundingRates({
            pair: candidatePair,
            start: input.startAt,
            end: input.endAt,
          });
          return { pair: candidatePair, rows: rows as FundingRateRow[] };
        } catch (error) {
          logWarn("BingX funding-rate query failed; continuing without funding features", {
            requestedPair: input.pair,
            candidatePair,
            error: String(error),
          });
          return { pair: candidatePair, rows: [] as FundingRateRow[] };
        }
      }),
    ),
    Promise.all(
      candidatePairs.map(async (candidatePair) => {
        try {
          const rows = await listBingxOpenInterest({
            pair: candidatePair,
            start: input.startAt,
            end: input.endAt,
          });
          return { pair: candidatePair, rows: rows as OpenInterestRow[] };
        } catch (error) {
          logWarn("BingX open-interest query failed; continuing without OI features", {
            requestedPair: input.pair,
            candidatePair,
            error: String(error),
          });
          return { pair: candidatePair, rows: [] as OpenInterestRow[] };
        }
      }),
    ),
    Promise.all(
      candidatePairs.map(async (candidatePair) => {
        try {
          const rows = await listBingxMarkIndexPrices({
            pair: candidatePair,
            start: input.startAt,
            end: input.endAt,
          });
          return { pair: candidatePair, rows: rows as MarkIndexRow[] };
        } catch (error) {
          logWarn("BingX mark/index query failed; continuing without mark/index features", {
            requestedPair: input.pair,
            candidatePair,
            error: String(error),
          });
          return { pair: candidatePair, rows: [] as MarkIndexRow[] };
        }
      }),
    ),
    Promise.all(
      candidatePairs.map(async (candidatePair) => {
        try {
          const rows = await listBingxTickers({
            pair: candidatePair,
            start: input.startAt,
            end: input.endAt,
          });
          return { pair: candidatePair, rows: rows as TickerRow[] };
        } catch (error) {
          logWarn("BingX ticker query failed; continuing without ticker features", {
            requestedPair: input.pair,
            candidatePair,
            error: String(error),
          });
          return { pair: candidatePair, rows: [] as TickerRow[] };
        }
      }),
    ),
  ]);
  const fundingRates = dedupeByTimestamp(
    fundingResults.flatMap((result) => result.rows),
    "funding_time",
  ) as FundingRateRow[];
  const openInterest = dedupeByTimestamp(
    openInterestResults.flatMap((result) => result.rows),
    "captured_at",
  ) as OpenInterestRow[];
  const markIndexPrices = dedupeByTimestamp(
    markIndexResults.flatMap((result) => result.rows),
    "captured_at",
  ) as MarkIndexRow[];
  const tickers = dedupeByTimestamp(
    tickerResults.flatMap((result) => result.rows),
    "captured_at",
  ) as TickerRow[];
  const normalizedFunding = normalizeTimeSeries(fundingRates as FundingRateRow[], "funding_time");
  const normalizedOpenInterest = normalizeTimeSeries(openInterest as OpenInterestRow[], "captured_at");
  const normalizedMarkIndex = normalizeTimeSeries(markIndexPrices as MarkIndexRow[], "captured_at");
  const normalizedTickers = normalizeTimeSeries(tickers as TickerRow[], "captured_at");

  let fundingIdx = -1;
  let oiIdx = -1;
  let markIdx = -1;
  let tickerIdx = -1;
  let previousOpenInterest = 0;
  const enrichedByTime = new Map<
    string,
    {
      funding_rate: number;
      funding_rate_annualized: number;
      open_interest: number;
      open_interest_delta_pct: number;
      mark_price: number;
      index_price: number;
      mark_index_basis_bps: number;
      ticker_last_price: number;
      ticker_price_change_24h: number;
      ticker_volume_24h: number;
    }
  >();

  for (const candle of candles) {
    const candleTime = new Date(candle.open_time).getTime();
    while (fundingIdx + 1 < normalizedFunding.length && normalizedFunding[fundingIdx + 1].ts <= candleTime) {
      fundingIdx += 1;
    }
    while (oiIdx + 1 < normalizedOpenInterest.length && normalizedOpenInterest[oiIdx + 1].ts <= candleTime) {
      oiIdx += 1;
    }
    while (markIdx + 1 < normalizedMarkIndex.length && normalizedMarkIndex[markIdx + 1].ts <= candleTime) {
      markIdx += 1;
    }
    while (tickerIdx + 1 < normalizedTickers.length && normalizedTickers[tickerIdx + 1].ts <= candleTime) {
      tickerIdx += 1;
    }

    const fundingRow = fundingIdx >= 0 ? normalizedFunding[fundingIdx].row : null;
    const openInterestRow = oiIdx >= 0 ? normalizedOpenInterest[oiIdx].row : null;
    const markIndexRow = markIdx >= 0 ? normalizedMarkIndex[markIdx].row : null;
    const tickerRow = tickerIdx >= 0 ? normalizedTickers[tickerIdx].row : null;

    const fundingRate = parseNumber(fundingRow?.funding_rate ?? 0);
    const openInterestValue = parseNumber(openInterestRow?.open_interest ?? previousOpenInterest);
    const openInterestDeltaPct = percentDelta(openInterestValue, previousOpenInterest);
    previousOpenInterest = openInterestValue;

    const markPrice = parseNumber(markIndexRow?.mark_price ?? candle.close);
    const indexPrice = parseNumber(markIndexRow?.index_price ?? candle.close);
    const markIndexBasisBps = indexPrice !== 0 ? ((markPrice - indexPrice) / indexPrice) * 10_000 : 0;

    enrichedByTime.set(candle.open_time, {
      funding_rate: fundingRate,
      funding_rate_annualized: fundingRate * 3 * 365,
      open_interest: openInterestValue,
      open_interest_delta_pct: openInterestDeltaPct,
      mark_price: markPrice,
      index_price: indexPrice,
      mark_index_basis_bps: markIndexBasisBps,
      ticker_last_price: parseNumber(tickerRow?.last_price ?? candle.close),
      ticker_price_change_24h: parseNumber(tickerRow?.price_change_24h ?? 0),
      ticker_volume_24h: parseNumber(tickerRow?.volume_24h ?? 0),
    });
  }

  const featureSnapshots =
    input.featureSetVersionId && input.featureSchemaFingerprint
      ? await ensureFeatureSnapshots({
          pair: resolvedPair as TradingPair,
          interval: input.interval,
          startAt: input.startAt,
          endAt: input.endAt,
          featureSetVersionId: input.featureSetVersionId,
        })
      : [];
  const featureByTime = new Map(
    featureSnapshots
      .filter((snapshot) => snapshot.schema_fingerprint === (input.featureSchemaFingerprint ?? snapshot.schema_fingerprint))
      .map((snapshot) => [snapshot.captured_at, snapshot.features as Record<string, number>]),
  );
  const features = candles
    .map((candle) => ({
      timestamp: candle.open_time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      ...(enrichedByTime.get(candle.open_time) ?? {}),
      ...(featureByTime.get(candle.open_time) ?? {}),
    }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const dataFields = new Set<string>();
  for (const row of features.slice(0, 100)) {
    for (const key of Object.keys(row)) {
      dataFields.add(key);
    }
  }
  const dataSources: DatasetDataSourceEntry[] = [
    {
      source: "bingx_candles",
      pairs: storedPairsUsed.length > 0 ? storedPairsUsed : [resolvedPair],
      rows: candles.length,
    },
    {
      source: "bingx_funding_rates",
      pairs: fundingResults.filter((result) => result.rows.length > 0).map((result) => result.pair),
      rows: fundingRates.length,
    },
    {
      source: "bingx_open_interest",
      pairs: openInterestResults.filter((result) => result.rows.length > 0).map((result) => result.pair),
      rows: openInterest.length,
    },
    {
      source: "bingx_mark_index_prices",
      pairs: markIndexResults.filter((result) => result.rows.length > 0).map((result) => result.pair),
      rows: markIndexPrices.length,
    },
    {
      source: "bingx_tickers",
      pairs: tickerResults.filter((result) => result.rows.length > 0).map((result) => result.pair),
      rows: tickers.length,
    },
    {
      source: "rl_feature_snapshots",
      pairs: featureSnapshots.length > 0 ? [resolvedPair] : [],
      rows: featureSnapshots.length,
    },
  ].filter((entry) => entry.rows > 0);

  return {
    features,
    provenance: {
      requestedPair: input.pair,
      requestedBingxSymbol,
      resolvedPair,
      resolvedBingxSymbol,
      candidatePairs,
      interval: input.interval,
      periodStart: input.startAt,
      periodEnd: input.endAt,
      rowCounts: {
        candles: candles.length,
        funding: fundingRates.length,
        openInterest: openInterest.length,
        markIndex: markIndexPrices.length,
        tickers: tickers.length,
        featureSnapshots: featureSnapshots.length,
      },
      dataSources,
      dataFields: Array.from(dataFields).sort(),
      candlesOrigin,
      liveFetch: {
        attemptedSymbols: Array.from(liveAttemptedSymbols),
        usedSymbol: liveUsedSymbol,
        usedRangeStart: liveRangeStart,
        usedRangeEnd: liveRangeEnd,
      },
    },
  };
}

export async function buildDatasetFeatures(input: DatasetPreviewRequest) {
  const result = await buildDatasetFeaturesWithProvenance(input);
  return result.features;
}

export async function createDatasetVersion(input: {
  pair: TradingPair;
  interval: string;
  startAt: string;
  endAt: string;
  featureSetVersionId?: string | null;
  windowSize?: number;
  stride?: number;
}) {
  const featureSet = input.featureSetVersionId ?? (await ensureFeatureSetVersion()).id;
  const featureConfig = await getFeatureSetConfigById(featureSet);
  const featureSchemaFingerprint = getFeatureSchemaFingerprint(featureConfig);
  const windowSize = input.windowSize ?? 30;
  const stride = input.stride ?? 1;
  const features = await buildDatasetFeatures({
    pair: input.pair,
    interval: input.interval,
    startAt: input.startAt,
    endAt: input.endAt,
    windowSize,
    stride,
    featureSetVersionId: featureSet,
    featureSchemaFingerprint,
  });
  const config = loadRlServiceConfig();
  const previewRequest: DatasetPreviewRequest = {
    pair: input.pair,
    interval: input.interval,
    startAt: input.startAt,
    endAt: input.endAt,
    windowSize,
    stride,
    featureSetVersionId: featureSet,
    featureSchemaFingerprint,
    features,
  };

  const preview = config.mock
    ? buildMockPreview(previewRequest, featureSet)
    : await rlServiceClient.datasetPreview(previewRequest);

  const version = normalizePreviewVersion(preview.version as DatasetPreviewResponse["version"] & Record<string, unknown>);
  const dataset = await insertDatasetVersion({
    pair: version.pair,
    interval: version.interval,
    start_at: version.start_at,
    end_at: version.end_at,
    checksum: version.checksum,
    dataset_hash: version.dataset_hash ?? null,
    window_size: version.window_size ?? null,
    stride: version.stride ?? null,
    feature_set_version_id: featureSet,
    feature_schema_fingerprint: featureSchemaFingerprint,
  });

  await insertDatasetLineage({
    dataset_id: dataset.id,
    source_run_ids: await latestSourceRunIds(),
    parent_dataset_ids: [],
  });

  return dataset;
}
