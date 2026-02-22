import { randomUUID } from "node:crypto";
import { convex } from "../client";
import { assertNoError } from "./base";
import { listRlOpsRows, rlOpsUsesTimescale, upsertRlOpsRow } from "../timescale/rl_ops";

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
  pair: string;
  last_seen_at?: string | null;
  freshness_threshold_seconds: number;
  status?: "ok" | "stale" | "unavailable";
  updated_at?: string;
};

function isOptimisticConcurrencyError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.message.includes("OptimisticConcurrencyControlFailure");
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function upsertDataSourceStatus(payload: DataSourceStatusInsert) {
  if (rlOpsUsesTimescale()) {
    const now = new Date().toISOString();
    return upsertRlOpsRow(
      "data_source_status",
      {
        id: randomUUID(),
        source_type: payload.source_type,
        pair: payload.pair,
        last_seen_at: payload.last_seen_at ?? null,
        freshness_threshold_seconds: payload.freshness_threshold_seconds,
        status: payload.status ?? "unavailable",
        updated_at: payload.updated_at ?? now,
        created_at: now,
      },
      ["pair", "source_type"],
    );
  }
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await convex
        .from("data_source_status")
        .upsert(payload, { onConflict: "pair,source_type" })
        .select("*")
        .single();
      return assertNoError(result, "upsert data source status");
    } catch (error) {
      if (!isOptimisticConcurrencyError(error) || attempt === maxAttempts) {
        throw error;
      }
      await sleep(20 * attempt);
    }
  }
  throw new Error("upsert data source status: exceeded retry attempts");
}

export async function listDataSourceStatus(pair?: DataSourceStatusInsert["pair"]) {
  if (rlOpsUsesTimescale()) {
    const filters = pair ? [{ field: "pair", value: pair }] : [];
    return listRlOpsRows("data_source_status", {
      filters,
      orderBy: "source_type",
      direction: "asc",
    });
  }
  const query = convex.from("data_source_status").select("*").order("source_type", { ascending: true });
  if (pair) {
    query.eq("pair", pair);
  }
  const result = await query;
  return assertNoError(result, "list data source status");
}
