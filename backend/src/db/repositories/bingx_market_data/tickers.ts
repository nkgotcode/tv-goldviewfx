import { supabase } from "../../client";
import { assertNoError } from "../base";

export type BingxTickerInsert = {
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
  last_price: number;
  volume_24h?: number | null;
  price_change_24h?: number | null;
  captured_at: string;
  source?: string | null;
};

export async function upsertBingxTickers(rows: BingxTickerInsert[]) {
  if (rows.length === 0) return [];
  const result = await supabase
    .from("bingx_tickers")
    .upsert(rows, { onConflict: "pair,captured_at" })
    .select("*");
  return assertNoError(result, "upsert bingx tickers");
}

export async function getLatestTickerTime(pair: BingxTickerInsert["pair"]) {
  const result = await supabase
    .from("bingx_tickers")
    .select("captured_at")
    .eq("pair", pair)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    throw new Error(`get latest ticker time: ${result.error.message}`);
  }
  return result.data?.captured_at ?? null;
}
