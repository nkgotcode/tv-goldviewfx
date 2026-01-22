import { supabase } from "../client";
import { assertNoError } from "./base";

export type DataSourceStatusInsert = {
  source_type:
    | "bingx_candles"
    | "bingx_orderbook"
    | "bingx_trades"
    | "bingx_funding"
    | "bingx_open_interest"
    | "bingx_mark_price"
    | "bingx_index_price"
    | "bingx_ticker"
    | "ideas"
    | "signals"
    | "news"
    | "trades";
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
  last_seen_at?: string | null;
  freshness_threshold_seconds: number;
  status?: "ok" | "stale" | "unavailable";
  updated_at?: string;
};

export async function upsertDataSourceStatus(payload: DataSourceStatusInsert) {
  const result = await supabase
    .from("data_source_status")
    .upsert(payload, { onConflict: "pair,source_type" })
    .select("*")
    .single();
  return assertNoError(result, "upsert data source status");
}

export async function listDataSourceStatus(pair?: DataSourceStatusInsert["pair"]) {
  const query = supabase.from("data_source_status").select("*").order("source_type", { ascending: true });
  if (pair) {
    query.eq("pair", pair);
  }
  const result = await query;
  return assertNoError(result, "list data source status");
}
