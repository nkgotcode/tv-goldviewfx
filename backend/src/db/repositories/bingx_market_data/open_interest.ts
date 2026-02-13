import { convexClient } from "../../client";
import { anyApi } from "convex/server";

export type BingxOpenInterestInsert = {
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
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
  try {
    return await convexClient.query(anyApi.bingx_open_interest.latestTime, { pair });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`get latest open interest time: ${message}`);
  }
}
