import { convexClient } from "../../client";
import { anyApi } from "convex/server";
import {
  getTimescaleLatestOrderbookTime,
  insertTimescaleOrderbookSnapshot,
  marketDataUsesTimescale,
} from "../../timescale/market_data";

export type BingxOrderBookSnapshotInsert = {
  pair: string;
  captured_at: string;
  depth_level: number;
  bids: unknown;
  asks: unknown;
  source?: string | null;
};

export async function insertOrderBookSnapshot(payload: BingxOrderBookSnapshotInsert) {
  if (marketDataUsesTimescale()) {
    return insertTimescaleOrderbookSnapshot(payload);
  }
  try {
    return await convexClient.mutation(anyApi.bingx_orderbook_snapshots.insertOne, { row: payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mutation failed";
    throw new Error(`insert bingx orderbook snapshot: ${message}`);
  }
}

export async function getLatestOrderBookTime(pair: BingxOrderBookSnapshotInsert["pair"]) {
  if (marketDataUsesTimescale()) {
    return getTimescaleLatestOrderbookTime(pair);
  }
  try {
    return await convexClient.query(anyApi.bingx_orderbook_snapshots.latestTime, { pair });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`get latest orderbook time: ${message}`);
  }
}
