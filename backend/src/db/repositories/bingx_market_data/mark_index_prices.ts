import { supabase } from "../../client";
import { assertNoError } from "../base";

export type BingxMarkIndexPriceInsert = {
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
  mark_price: number;
  index_price: number;
  captured_at: string;
  source?: string | null;
};

export async function upsertBingxMarkIndexPrices(rows: BingxMarkIndexPriceInsert[]) {
  if (rows.length === 0) return [];
  const result = await supabase
    .from("bingx_mark_index_prices")
    .upsert(rows, { onConflict: "pair,captured_at" })
    .select("*");
  return assertNoError(result, "upsert bingx mark/index prices");
}

export async function getLatestMarkIndexTime(pair: BingxMarkIndexPriceInsert["pair"]) {
  const result = await supabase
    .from("bingx_mark_index_prices")
    .select("captured_at")
    .eq("pair", pair)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    throw new Error(`get latest mark/index time: ${result.error.message}`);
  }
  return result.data?.captured_at ?? null;
}

export async function getLatestMarkIndexSnapshot(pair: BingxMarkIndexPriceInsert["pair"]) {
  const result = await supabase
    .from("bingx_mark_index_prices")
    .select("mark_price,index_price,captured_at")
    .eq("pair", pair)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    throw new Error(`get latest mark/index snapshot: ${result.error.message}`);
  }
  return result.data ?? null;
}
