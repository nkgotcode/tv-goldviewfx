import { convexClient } from "../../client";
import { anyApi } from "convex/server";

export type BingxMarkIndexPriceInsert = {
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
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
  try {
    return await convexClient.query(anyApi.bingx_mark_index_prices.latestTime, { pair });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`get latest mark/index time: ${message}`);
  }
}

export async function getLatestMarkIndexSnapshot(pair: BingxMarkIndexPriceInsert["pair"]) {
  try {
    return await convexClient.query(anyApi.bingx_mark_index_prices.latestSnapshot, { pair });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`get latest mark/index snapshot: ${message}`);
  }
}
