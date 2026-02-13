import { convexClient } from "../../client";
import { anyApi } from "convex/server";

export type BingxTickerInsert = {
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
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
  try {
    return await convexClient.query(anyApi.bingx_tickers.latestTime, { pair });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`get latest ticker time: ${message}`);
  }
}
