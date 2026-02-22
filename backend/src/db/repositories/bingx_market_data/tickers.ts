import { convexClient } from "../../client";
import { anyApi } from "convex/server";
import {
  getTimescaleLatestTickerTime,
  listTimescaleTickers,
  marketDataUsesTimescale,
  upsertTimescaleTickers,
} from "../../timescale/market_data";

export type BingxTickerInsert = {
  pair: string;
  last_price: number;
  volume_24h?: number | null;
  price_change_24h?: number | null;
  captured_at: string;
  source?: string | null;
};

const MAX_TICKER_UPSERT_BATCH = 200;

async function upsertBingxTickerBatch(rows: BingxTickerInsert[]) {
  try {
    return await convexClient.mutation(anyApi.bingx_tickers.upsertBatch, { rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mutation failed";
    throw new Error(`upsert bingx tickers: ${message}`);
  }
}

export async function upsertBingxTickers(rows: BingxTickerInsert[]) {
  if (marketDataUsesTimescale()) {
    return upsertTimescaleTickers(rows);
  }
  if (rows.length === 0) return [];
  if (rows.length <= MAX_TICKER_UPSERT_BATCH) {
    return upsertBingxTickerBatch(rows);
  }
  const results: Array<Record<string, unknown>> = [];
  for (let i = 0; i < rows.length; i += MAX_TICKER_UPSERT_BATCH) {
    const batch = rows.slice(i, i + MAX_TICKER_UPSERT_BATCH);
    try {
      results.push(...(await upsertBingxTickerBatch(batch)));
    } catch (error) {
      if (batch.length <= 1) {
        throw error;
      }
      const mid = Math.ceil(batch.length / 2);
      results.push(...(await upsertBingxTickers(batch.slice(0, mid))));
      results.push(...(await upsertBingxTickers(batch.slice(mid))));
    }
  }
  return results;
}

export async function getLatestTickerTime(pair: BingxTickerInsert["pair"]) {
  if (marketDataUsesTimescale()) {
    return getTimescaleLatestTickerTime(pair);
  }
  try {
    return await convexClient.query(anyApi.bingx_tickers.latestTime, { pair });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`get latest ticker time: ${message}`);
  }
}

export async function listBingxTickers(filters: {
  pair: BingxTickerInsert["pair"];
  start?: string;
  end?: string;
  limit?: number;
}) {
  if (marketDataUsesTimescale()) {
    return listTimescaleTickers(filters);
  }
  try {
    if (filters.limit !== undefined) {
      return await convexClient.query(anyApi.bingx_tickers.listByRange, {
        pair: filters.pair,
        start: filters.start,
        end: filters.end,
        limit: filters.limit,
        order: "asc",
      });
    }

    const results: Array<Record<string, unknown>> = [];
    const pageLimit = 2000;
    let nextStart = filters.start;
    let lastCapturedAt: string | null = null;

    while (true) {
      const rows = await convexClient.query(anyApi.bingx_tickers.listByRange, {
        pair: filters.pair,
        start: nextStart,
        end: filters.end,
        limit: pageLimit,
        order: "asc",
      });
      results.push(...rows);
      if (rows.length < pageLimit) {
        break;
      }
      const last = rows[rows.length - 1] as { captured_at?: string };
      if (!last?.captured_at || last.captured_at === lastCapturedAt) {
        break;
      }
      lastCapturedAt = last.captured_at;
      const nextMs = new Date(last.captured_at).getTime() + 1;
      if (!Number.isFinite(nextMs)) {
        break;
      }
      nextStart = new Date(nextMs).toISOString();
    }
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`list bingx tickers: ${message}`);
  }
}
