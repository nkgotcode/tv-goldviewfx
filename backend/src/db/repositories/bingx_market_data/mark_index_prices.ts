import { convexClient } from "../../client";
import { anyApi } from "convex/server";
import {
  getTimescaleLatestMarkIndexSnapshot,
  getTimescaleLatestMarkIndexTime,
  listTimescaleMarkIndexPrices,
  marketDataUsesTimescale,
  upsertTimescaleMarkIndexPrices,
} from "../../timescale/market_data";

export type BingxMarkIndexPriceInsert = {
  pair: string;
  mark_price: number;
  index_price: number;
  captured_at: string;
  source?: string | null;
};

const MAX_MARK_INDEX_UPSERT_BATCH = 200;

async function upsertBingxMarkIndexBatch(rows: BingxMarkIndexPriceInsert[]) {
  try {
    return await convexClient.mutation(anyApi.bingx_mark_index_prices.upsertBatch, { rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mutation failed";
    throw new Error(`upsert bingx mark/index prices: ${message}`);
  }
}

export async function upsertBingxMarkIndexPrices(rows: BingxMarkIndexPriceInsert[]) {
  if (marketDataUsesTimescale()) {
    return upsertTimescaleMarkIndexPrices(rows);
  }
  if (rows.length === 0) return [];
  if (rows.length <= MAX_MARK_INDEX_UPSERT_BATCH) {
    return upsertBingxMarkIndexBatch(rows);
  }
  const results: Array<Record<string, unknown>> = [];
  for (let i = 0; i < rows.length; i += MAX_MARK_INDEX_UPSERT_BATCH) {
    const batch = rows.slice(i, i + MAX_MARK_INDEX_UPSERT_BATCH);
    try {
      results.push(...(await upsertBingxMarkIndexBatch(batch)));
    } catch (error) {
      if (batch.length <= 1) {
        throw error;
      }
      const mid = Math.ceil(batch.length / 2);
      results.push(...(await upsertBingxMarkIndexPrices(batch.slice(0, mid))));
      results.push(...(await upsertBingxMarkIndexPrices(batch.slice(mid))));
    }
  }
  return results;
}

export async function getLatestMarkIndexTime(pair: BingxMarkIndexPriceInsert["pair"]) {
  if (marketDataUsesTimescale()) {
    return getTimescaleLatestMarkIndexTime(pair);
  }
  try {
    return await convexClient.query(anyApi.bingx_mark_index_prices.latestTime, { pair });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`get latest mark/index time: ${message}`);
  }
}

export async function getLatestMarkIndexSnapshot(pair: BingxMarkIndexPriceInsert["pair"]) {
  if (marketDataUsesTimescale()) {
    return getTimescaleLatestMarkIndexSnapshot(pair);
  }
  try {
    return await convexClient.query(anyApi.bingx_mark_index_prices.latestSnapshot, { pair });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`get latest mark/index snapshot: ${message}`);
  }
}

export async function listBingxMarkIndexPrices(filters: {
  pair: BingxMarkIndexPriceInsert["pair"];
  start?: string;
  end?: string;
  limit?: number;
}) {
  if (marketDataUsesTimescale()) {
    return listTimescaleMarkIndexPrices(filters);
  }
  try {
    if (filters.limit !== undefined) {
      return await convexClient.query(anyApi.bingx_mark_index_prices.listByRange, {
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
      const rows = await convexClient.query(anyApi.bingx_mark_index_prices.listByRange, {
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
    throw new Error(`list bingx mark/index prices: ${message}`);
  }
}
