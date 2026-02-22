import { convexClient } from "../../client";
import { anyApi } from "convex/server";
import {
  getTimescaleEarliestFundingTime,
  getTimescaleLatestFundingTime,
  listTimescaleFundingRates,
  marketDataUsesTimescale,
  upsertTimescaleFundingRates,
} from "../../timescale/market_data";

export type BingxFundingRateInsert = {
  pair: string;
  funding_rate: number;
  funding_time: string;
  source?: string | null;
};

const MAX_FUNDING_UPSERT_BATCH = 200;

async function upsertBingxFundingBatch(rows: BingxFundingRateInsert[]) {
  try {
    return await convexClient.mutation(anyApi.bingx_funding_rates.upsertBatch, { rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mutation failed";
    throw new Error(`upsert bingx funding rates: ${message}`);
  }
}

export async function upsertBingxFundingRates(rows: BingxFundingRateInsert[]) {
  if (marketDataUsesTimescale()) {
    return upsertTimescaleFundingRates(rows);
  }
  if (rows.length === 0) return [];
  if (rows.length <= MAX_FUNDING_UPSERT_BATCH) {
    return upsertBingxFundingBatch(rows);
  }
  const results: Array<Record<string, unknown>> = [];
  for (let i = 0; i < rows.length; i += MAX_FUNDING_UPSERT_BATCH) {
    const batch = rows.slice(i, i + MAX_FUNDING_UPSERT_BATCH);
    try {
      results.push(...(await upsertBingxFundingBatch(batch)));
    } catch (error) {
      if (batch.length <= 1) {
        throw error;
      }
      const mid = Math.ceil(batch.length / 2);
      results.push(...(await upsertBingxFundingRates(batch.slice(0, mid))));
      results.push(...(await upsertBingxFundingRates(batch.slice(mid))));
    }
  }
  return results;
}

export async function getLatestFundingTime(pair: BingxFundingRateInsert["pair"]) {
  if (marketDataUsesTimescale()) {
    return getTimescaleLatestFundingTime(pair);
  }
  try {
    return await convexClient.query(anyApi.bingx_funding_rates.latestTime, { pair });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`get latest funding time: ${message}`);
  }
}

export async function getEarliestFundingTime(pair: BingxFundingRateInsert["pair"]) {
  if (marketDataUsesTimescale()) {
    return getTimescaleEarliestFundingTime(pair);
  }
  try {
    return await convexClient.query(anyApi.bingx_funding_rates.earliestTime, { pair });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`get earliest funding time: ${message}`);
  }
}

export async function listBingxFundingRates(filters: {
  pair: BingxFundingRateInsert["pair"];
  start?: string;
  end?: string;
  limit?: number;
}) {
  if (marketDataUsesTimescale()) {
    return listTimescaleFundingRates(filters);
  }
  try {
    if (filters.limit !== undefined) {
      return await convexClient.query(anyApi.bingx_funding_rates.listByRange, {
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
    let lastFundingTime: string | null = null;

    while (true) {
      const rows = await convexClient.query(anyApi.bingx_funding_rates.listByRange, {
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
      const last = rows[rows.length - 1] as { funding_time?: string };
      if (!last?.funding_time || last.funding_time === lastFundingTime) {
        break;
      }
      lastFundingTime = last.funding_time;
      const nextMs = new Date(last.funding_time).getTime() + 1;
      if (!Number.isFinite(nextMs)) {
        break;
      }
      nextStart = new Date(nextMs).toISOString();
    }
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`list bingx funding rates: ${message}`);
  }
}
