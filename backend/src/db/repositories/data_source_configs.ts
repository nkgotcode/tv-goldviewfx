import { supabase } from "../client";
import { assertNoError } from "./base";

export type DataSourceConfigInsert = {
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
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
  enabled: boolean;
  freshness_threshold_seconds: number;
  updated_at?: string;
};

export async function upsertDataSourceConfig(payload: DataSourceConfigInsert) {
  const result = await supabase
    .from("data_source_configs")
    .upsert(payload, { onConflict: "pair,source_type" })
    .select("*")
    .single();
  return assertNoError(result, "upsert data source config");
}

export async function listDataSourceConfigs(pair?: DataSourceConfigInsert["pair"]) {
  const query = supabase.from("data_source_configs").select("*").order("source_type", { ascending: true });
  if (pair) {
    query.eq("pair", pair);
  }
  const result = await query;
  return assertNoError(result, "list data source configs");
}

export async function getDataSourceConfig(pair: DataSourceConfigInsert["pair"], sourceType: DataSourceConfigInsert["source_type"]) {
  const result = await supabase
    .from("data_source_configs")
    .select("*")
    .eq("pair", pair)
    .eq("source_type", sourceType)
    .maybeSingle();
  return assertNoError(result, "get data source config");
}
