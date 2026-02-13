import { createHash, randomUUID } from "node:crypto";
import { insertDatasetVersion } from "../db/repositories/dataset_versions";
import { insertDatasetLineage } from "../db/repositories/dataset_lineage";
import { listFeatureSetVersions } from "../db/repositories/feature_set_versions";
import { listIngestionRuns } from "../db/repositories/ingestion_runs";
import { listBingxCandles } from "../db/repositories/bingx_market_data/candles";
import { loadEnv } from "../config/env";
import { loadRlServiceConfig } from "../config/rl_service";
import { rlServiceClient } from "../rl/client";
import type { DatasetPreviewRequest, DatasetPreviewResponse } from "../types/rl";
import type { TradingPair } from "../types/rl";
import { resolveFeatureSetVersion } from "./feature_set_service";
import { logWarn } from "./logger";

const BINGX_SYMBOL_MAP: Record<TradingPair, string> = {
  "Gold-USDT": "GOLD-USDT",
  XAUTUSDT: "XAUT-USDT",
  PAXGUSDT: "PAXG-USDT",
};

function toBingxSymbol(pair: TradingPair) {
  return BINGX_SYMBOL_MAP[pair] ?? pair.toUpperCase();
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

type CandleRow = {
  open_time: string;
  close_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

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
    return [];
  }
  const symbols =
    input.pair === "Gold-USDT"
      ? ["GOLD-USDT", "XAUT-USDT", "PAXG-USDT"]
      : [toBingxSymbol(input.pair)];

  let lastError: Error | null = null;
  for (const symbol of symbols) {
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
    return rows
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
      .filter(Boolean);
  }

  if (lastError) {
    throw lastError;
  }
  return [];
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
};

function buildMockPreview(input: DatasetPreviewRequest, featureSetVersionId?: string | null): DatasetPreviewResponse {
  const payload = {
    pair: input.pair,
    interval: input.interval,
    start_at: input.startAt,
    end_at: input.endAt,
    feature_set_version_id: featureSetVersionId ?? null,
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

function parseIntervalMs(interval: string) {
  if (interval.endsWith("m")) {
    return Number(interval.replace("m", "")) * 60 * 1000;
  }
  if (interval.endsWith("h")) {
    return Number(interval.replace("h", "")) * 60 * 60 * 1000;
  }
  if (interval.endsWith("d")) {
    return Number(interval.replace("d", "")) * 24 * 60 * 60 * 1000;
  }
  return 60 * 1000;
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

export async function buildDatasetFeatures(input: DatasetPreviewRequest) {
  const intervalMs = parseIntervalMs(input.interval);
  const startMs = new Date(input.startAt).getTime();
  const endMs = new Date(input.endAt).getTime();
  const maxLiveWindowMs = intervalMs * 1000;
  const allowLiveFetch = !["1", "true", "yes", "on"].includes(
    (process.env.BINGX_MARKET_DATA_MOCK ?? "").toLowerCase(),
  );

  let convexCandles: CandleRow[] = [];
  try {
    convexCandles = await listBingxCandles({
      pair: input.pair,
      interval: input.interval,
      start: input.startAt,
      end: input.endAt,
    });
  } catch (error) {
    logWarn("BingX candle query failed; falling back to live API fetch", {
      pair: input.pair,
      interval: input.interval,
      error: String(error),
    });
  }

  const liveCandles: CandleRow[] = [];
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
      const rangeCandles = await fetchBingxCandlesDirect({
        ...input,
        startAt: new Date(maxStart).toISOString(),
        endAt: new Date(rangeEndMs).toISOString(),
      });
      liveCandles.push(...rangeCandles);
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

  if (candles.length === 0) {
    const config = loadRlServiceConfig();
    const allowSynthetic = config.mock || ["1", "true", "yes", "on"].includes((process.env.BINGX_MARKET_DATA_MOCK ?? "").toLowerCase());
    if (allowSynthetic) {
      return buildSyntheticFeatures(input);
    }
  }
  return candles
    .map((candle) => ({
      timestamp: candle.open_time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
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
  });

  await insertDatasetLineage({
    dataset_id: dataset.id,
    source_run_ids: await latestSourceRunIds(),
    parent_dataset_ids: [],
  });

  return dataset;
}
