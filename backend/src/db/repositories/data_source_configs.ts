import { randomUUID } from "node:crypto";
import { convex } from "../client";
import { assertNoError } from "./base";
import { listRlOpsRows, rlOpsUsesTimescale, upsertRlOpsRow } from "../timescale/rl_ops";

export type DataSourceConfigInsert = {
  pair: string;
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
  if (rlOpsUsesTimescale()) {
    const now = new Date().toISOString();
    return upsertRlOpsRow(
      "data_source_configs",
      {
        id: randomUUID(),
        pair: payload.pair,
        source_type: payload.source_type,
        enabled: payload.enabled,
        freshness_threshold_seconds: payload.freshness_threshold_seconds,
        updated_at: payload.updated_at ?? now,
        created_at: now,
      },
      ["pair", "source_type"],
    );
  }
  const result = await convex
    .from("data_source_configs")
    .upsert(payload, { onConflict: "pair,source_type" })
    .select("*")
    .single();
  return assertNoError(result, "upsert data source config");
}

export async function listDataSourceConfigs(pair?: DataSourceConfigInsert["pair"]) {
  if (rlOpsUsesTimescale()) {
    const filters = pair ? [{ field: "pair", value: pair }] : [];
    return listRlOpsRows("data_source_configs", {
      filters,
      orderBy: "source_type",
      direction: "asc",
    });
  }
  const query = convex.from("data_source_configs").select("*").order("source_type", { ascending: true });
  if (pair) {
    query.eq("pair", pair);
  }
  const result = await query;
  return assertNoError(result, "list data source configs");
}

export async function getDataSourceConfig(pair: DataSourceConfigInsert["pair"], sourceType: DataSourceConfigInsert["source_type"]) {
  if (rlOpsUsesTimescale()) {
    const rows = await listRlOpsRows("data_source_configs", {
      filters: [
        { field: "pair", value: pair },
        { field: "source_type", value: sourceType },
      ],
      limit: 1,
    });
    return rows[0] ?? null;
  }
  const result = await convex
    .from("data_source_configs")
    .select("*")
    .eq("pair", pair)
    .eq("source_type", sourceType)
    .maybeSingle();
  return assertNoError(result, "get data source config");
}
