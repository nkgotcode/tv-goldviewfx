import { supabase } from "../../client";
import { assertNoError } from "../base";

export type BingxFundingRateInsert = {
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
  funding_rate: number;
  funding_time: string;
  source?: string | null;
};

export async function upsertBingxFundingRates(rows: BingxFundingRateInsert[]) {
  if (rows.length === 0) return [];
  const result = await supabase
    .from("bingx_funding_rates")
    .upsert(rows, { onConflict: "pair,funding_time" })
    .select("*");
  return assertNoError(result, "upsert bingx funding rates");
}

export async function getLatestFundingTime(pair: BingxFundingRateInsert["pair"]) {
  const result = await supabase
    .from("bingx_funding_rates")
    .select("funding_time")
    .eq("pair", pair)
    .order("funding_time", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    throw new Error(`get latest funding time: ${result.error.message}`);
  }
  return result.data?.funding_time ?? null;
}

export async function getEarliestFundingTime(pair: BingxFundingRateInsert["pair"]) {
  const result = await supabase
    .from("bingx_funding_rates")
    .select("funding_time")
    .eq("pair", pair)
    .order("funding_time", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    throw new Error(`get earliest funding time: ${result.error.message}`);
  }
  return result.data?.funding_time ?? null;
}
