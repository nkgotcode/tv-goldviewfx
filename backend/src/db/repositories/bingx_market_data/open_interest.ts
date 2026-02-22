import { convexClient } from "../../client";
import { anyApi } from "convex/server";
import {
  listTimescaleOpenInterest,
  getTimescaleLatestOpenInterestTime,
  marketDataUsesTimescale,
  upsertTimescaleOpenInterest,
} from "../../timescale/market_data";

export type BingxOpenInterestInsert = {
  pair: string;
  open_interest: number;
  captured_at: string;
  source?: string | null;
};

const MAX_OPEN_INTEREST_UPSERT_BATCH = 200;

async function upsertBingxOpenInterestBatch(rows: BingxOpenInterestInsert[]) {
  try {
    return await convexClient.mutation(anyApi.bingx_open_interest.upsertBatch, { rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mutation failed";
    throw new Error(`upsert bingx open interest: ${message}`);
  }
}

export async function upsertBingxOpenInterest(rows: BingxOpenInterestInsert[]) {
  if (marketDataUsesTimescale()) {
    return upsertTimescaleOpenInterest(rows);
  }
  if (rows.length === 0) return [];
  if (rows.length <= MAX_OPEN_INTEREST_UPSERT_BATCH) {
    return upsertBingxOpenInterestBatch(rows);
  }
  const results: Array<Record<string, unknown>> = [];
  for (let i = 0; i < rows.length; i += MAX_OPEN_INTEREST_UPSERT_BATCH) {
    const batch = rows.slice(i, i + MAX_OPEN_INTEREST_UPSERT_BATCH);
    try {
      results.push(...(await upsertBingxOpenInterestBatch(batch)));
    } catch (error) {
      if (batch.length <= 1) {
        throw error;
      }
      const mid = Math.ceil(batch.length / 2);
      results.push(...(await upsertBingxOpenInterest(batch.slice(0, mid))));
      results.push(...(await upsertBingxOpenInterest(batch.slice(mid))));
    }
  }
  return results;
}

export async function getLatestOpenInterestTime(pair: BingxOpenInterestInsert["pair"]) {
  if (marketDataUsesTimescale()) {
    return getTimescaleLatestOpenInterestTime(pair);
  }
  try {
    return await convexClient.query(anyApi.bingx_open_interest.latestTime, { pair });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`get latest open interest time: ${message}`);
  }
}

export async function listBingxOpenInterest(filters: {
  pair: BingxOpenInterestInsert["pair"];
  start?: string;
  end?: string;
  limit?: number;
}) {
  if (marketDataUsesTimescale()) {
    return listTimescaleOpenInterest(filters);
  }
  try {
    if (filters.limit !== undefined) {
      return await convexClient.query(anyApi.bingx_open_interest.listByRange, {
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
      const rows = await convexClient.query(anyApi.bingx_open_interest.listByRange, {
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
    throw new Error(`list bingx open interest: ${message}`);
  }
}
