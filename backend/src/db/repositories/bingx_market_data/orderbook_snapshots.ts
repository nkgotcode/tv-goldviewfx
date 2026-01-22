import { supabase } from "../../client";
import { assertNoError } from "../base";

export type BingxOrderBookSnapshotInsert = {
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
  captured_at: string;
  depth_level: number;
  bids: unknown;
  asks: unknown;
  source?: string | null;
};

export async function insertOrderBookSnapshot(payload: BingxOrderBookSnapshotInsert) {
  const result = await supabase.from("bingx_orderbook_snapshots").insert(payload).select("*").single();
  return assertNoError(result, "insert bingx orderbook snapshot");
}

export async function getLatestOrderBookTime(pair: BingxOrderBookSnapshotInsert["pair"]) {
  const result = await supabase
    .from("bingx_orderbook_snapshots")
    .select("captured_at")
    .eq("pair", pair)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    throw new Error(`get latest orderbook time: ${result.error.message}`);
  }
  return result.data?.captured_at ?? null;
}
