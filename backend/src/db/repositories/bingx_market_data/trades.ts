import { convexClient } from "../../client";
import { anyApi } from "convex/server";

export type BingxTradeInsert = {
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
  trade_id: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  executed_at: string;
  source?: string | null;
};

const MAX_TRADE_UPSERT_BATCH = 100;

async function upsertBingxTradeBatch(rows: BingxTradeInsert[]) {
  try {
    return await convexClient.mutation(anyApi.bingx_trades.upsertBatch, { rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mutation failed";
    throw new Error(`upsert bingx trades: ${message}`);
  }
}

export async function upsertBingxTrades(rows: BingxTradeInsert[]) {
  if (rows.length === 0) return [];
  if (rows.length <= MAX_TRADE_UPSERT_BATCH) {
    return upsertBingxTradeBatch(rows);
  }
  const results: Array<Record<string, unknown>> = [];
  for (let i = 0; i < rows.length; i += MAX_TRADE_UPSERT_BATCH) {
    const batch = rows.slice(i, i + MAX_TRADE_UPSERT_BATCH);
    try {
      results.push(...(await upsertBingxTradeBatch(batch)));
    } catch (error) {
      if (batch.length <= 1) {
        throw error;
      }
      const mid = Math.ceil(batch.length / 2);
      results.push(...(await upsertBingxTrades(batch.slice(0, mid))));
      results.push(...(await upsertBingxTrades(batch.slice(mid))));
    }
  }
  return results;
}

export async function getLatestTradeTime(pair: BingxTradeInsert["pair"]) {
  try {
    return await convexClient.query(anyApi.bingx_trades.latestTime, { pair });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`get latest trade time: ${message}`);
  }
}
