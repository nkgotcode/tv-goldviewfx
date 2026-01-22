import { supabase } from "../../client";
import { assertNoError } from "../base";

export type BingxTradeInsert = {
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
  trade_id: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  executed_at: string;
  source?: string | null;
};

export async function upsertBingxTrades(rows: BingxTradeInsert[]) {
  if (rows.length === 0) return [];
  const result = await supabase.from("bingx_trades").upsert(rows, { onConflict: "pair,trade_id" }).select("*");
  return assertNoError(result, "upsert bingx trades");
}

export async function getLatestTradeTime(pair: BingxTradeInsert["pair"]) {
  const result = await supabase
    .from("bingx_trades")
    .select("executed_at")
    .eq("pair", pair)
    .order("executed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    throw new Error(`get latest trade time: ${result.error.message}`);
  }
  return result.data?.executed_at ?? null;
}
