import { convexClient } from "../../client";
import { anyApi } from "convex/server";

export type BingxFundingRateInsert = {
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
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
  try {
    return await convexClient.query(anyApi.bingx_funding_rates.latestTime, { pair });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`get latest funding time: ${message}`);
  }
}

export async function getEarliestFundingTime(pair: BingxFundingRateInsert["pair"]) {
  try {
    return await convexClient.query(anyApi.bingx_funding_rates.earliestTime, { pair });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`get earliest funding time: ${message}`);
  }
}
