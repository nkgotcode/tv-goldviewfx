import { convexClient } from "../../client";
import { anyApi } from "convex/server";
import {
  getTimescaleEarliestCandleTime,
  getTimescaleLatestCandleTime,
  listTimescaleCandleOpenTimes,
  listTimescaleCandles,
  marketDataUsesTimescale,
  upsertTimescaleCandles,
} from "../../timescale/market_data";

export type BingxCandleInsert = {
  pair: string;
  interval: string;
  open_time: string;
  close_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quote_volume?: number | null;
  source?: string | null;
};

const MAX_CANDLE_UPSERT_BATCH = 100;

async function upsertBingxCandleBatch(rows: BingxCandleInsert[]) {
  try {
    return await convexClient.mutation(anyApi.bingx_candles.upsertBatch, { rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mutation failed";
    throw new Error(`upsert bingx candles: ${message}`);
  }
}

export async function upsertBingxCandles(rows: BingxCandleInsert[]) {
  if (marketDataUsesTimescale()) {
    return upsertTimescaleCandles(rows);
  }
  if (rows.length === 0) return [];
  if (rows.length <= MAX_CANDLE_UPSERT_BATCH) {
    return upsertBingxCandleBatch(rows);
  }
  const results: Array<Record<string, unknown>> = [];
  for (let i = 0; i < rows.length; i += MAX_CANDLE_UPSERT_BATCH) {
    const batch = rows.slice(i, i + MAX_CANDLE_UPSERT_BATCH);
    try {
      results.push(...(await upsertBingxCandleBatch(batch)));
    } catch (error) {
      if (batch.length <= 1) {
        throw error;
      }
      const mid = Math.ceil(batch.length / 2);
      results.push(...(await upsertBingxCandles(batch.slice(0, mid))));
      results.push(...(await upsertBingxCandles(batch.slice(mid))));
    }
  }
  return results;
}

export async function getLatestCandleTime(pair: BingxCandleInsert["pair"], interval: string) {
  if (marketDataUsesTimescale()) {
    return getTimescaleLatestCandleTime(pair, interval);
  }
  try {
    const rows = await convexClient.query(anyApi.bingx_candles.listByRange, {
      pair,
      interval,
      limit: 1,
      order: "desc",
    });
    return rows[0]?.open_time ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`get latest candle time: ${message}`);
  }
}

export async function getEarliestCandleTime(pair: BingxCandleInsert["pair"], interval: string) {
  if (marketDataUsesTimescale()) {
    return getTimescaleEarliestCandleTime(pair, interval);
  }
  try {
    const rows = await convexClient.query(anyApi.bingx_candles.listByRange, {
      pair,
      interval,
      limit: 1,
      order: "asc",
    });
    return rows[0]?.open_time ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`get earliest candle time: ${message}`);
  }
}

export async function listBingxCandles(filters: {
  pair: BingxCandleInsert["pair"];
  interval: string;
  start?: string;
  end?: string;
  limit?: number;
}) {
  if (marketDataUsesTimescale()) {
    return listTimescaleCandles(filters);
  }
  try {
    if (filters.limit !== undefined) {
      return await convexClient.query(anyApi.bingx_candles.listByRange, {
        pair: filters.pair,
        interval: filters.interval,
        start: filters.start,
        end: filters.end,
        limit: filters.limit,
        order: "asc",
      });
    }

    const results: Array<Record<string, unknown>> = [];
    const pageLimit = 2000;
    let nextStart = filters.start;
    let lastOpenTime: string | null = null;

    while (true) {
      const rows = await convexClient.query(anyApi.bingx_candles.listByRange, {
        pair: filters.pair,
        interval: filters.interval,
        start: nextStart,
        end: filters.end,
        limit: pageLimit,
        order: "asc",
      });
      results.push(...rows);
      if (rows.length < pageLimit) {
        break;
      }
      const last = rows[rows.length - 1] as { open_time?: string };
      if (!last?.open_time || last.open_time === lastOpenTime) {
        break;
      }
      lastOpenTime = last.open_time;
      const nextMs = new Date(last.open_time).getTime() + 1;
      if (!Number.isFinite(nextMs)) {
        break;
      }
      nextStart = new Date(nextMs).toISOString();
    }

    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`list bingx candles: ${message}`);
  }
}

export async function listBingxCandleTimes(filters: {
  pair: BingxCandleInsert["pair"];
  interval: string;
  start?: string;
  end?: string;
  limit?: number;
}) {
  if (marketDataUsesTimescale()) {
    return listTimescaleCandleOpenTimes({
      ...filters,
      limit: filters.limit ? Math.min(filters.limit, 5000) : undefined,
    });
  }
  try {
    const limit = filters.limit ? Math.min(filters.limit, 5000) : undefined;
    return await convexClient.query(anyApi.bingx_candles.listOpenTimesByRange, {
      pair: filters.pair,
      interval: filters.interval,
      start: filters.start,
      end: filters.end,
      limit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`list bingx candle times: ${message}`);
  }
}
