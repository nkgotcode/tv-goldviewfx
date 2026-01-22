import { supabase } from "../../client";
import { assertNoError } from "../base";

export type BingxOpenInterestInsert = {
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
  open_interest: number;
  captured_at: string;
  source?: string | null;
};

export async function upsertBingxOpenInterest(rows: BingxOpenInterestInsert[]) {
  if (rows.length === 0) return [];
  const result = await supabase
    .from("bingx_open_interest")
    .upsert(rows, { onConflict: "pair,captured_at" })
    .select("*");
  return assertNoError(result, "upsert bingx open interest");
}

export async function getLatestOpenInterestTime(pair: BingxOpenInterestInsert["pair"]) {
  const result = await supabase
    .from("bingx_open_interest")
    .select("captured_at")
    .eq("pair", pair)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    throw new Error(`get latest open interest time: ${result.error.message}`);
  }
  return result.data?.captured_at ?? null;
}
