import { convex } from "../client";
import { assertNoError } from "./base";

export type TradeInsert = {
  signal_id: string | null;
  agent_config_id: string | null;
  agent_run_id?: string | null;
  instrument: string;
  side: "long" | "short";
  quantity: number;
  status: "proposed" | "placed" | "partial" | "filled" | "cancelled" | "rejected";
  mode: "paper" | "live";
  client_order_id?: string | null;
  avg_fill_price?: number | null;
  position_size?: number | null;
  pnl?: number | null;
  pnl_pct?: number | null;
  tp_price?: number | null;
  sl_price?: number | null;
  closed_at?: string | null;
  liquidation_price?: number | null;
  leverage?: number | null;
  margin_type?: string | null;
};

export type TradeMetricsUpdate = {
  avg_fill_price?: number | null;
  position_size?: number | null;
  pnl?: number | null;
  pnl_pct?: number | null;
  tp_price?: number | null;
  sl_price?: number | null;
  closed_at?: string | null;
  liquidation_price?: number | null;
  leverage?: number | null;
  margin_type?: string | null;
};

export async function insertTrade(payload: TradeInsert) {
  const result = await convex.from("trades").insert(payload).select("*").single();
  return assertNoError(result, "insert trade");
}

export async function updateTradeStatus(id: string, status: TradeInsert["status"]) {
  const result = await convex
    .from("trades")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  return assertNoError(result, "update trade status");
}

export async function updateTradeMetrics(id: string, payload: TradeMetricsUpdate) {
  const result = await convex
    .from("trades")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  return assertNoError(result, "update trade metrics");
}

export async function listTrades(filters?: {
  status?: string;
  mode?: string;
  instrument?: string;
  side?: string;
  start?: string;
  end?: string;
  page?: number;
  pageSize?: number;
}) {
  const query = convex
    .from("trades")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });
  if (filters?.status) {
    query.eq("status", filters.status);
  }
  if (filters?.mode) {
    query.eq("mode", filters.mode);
  }
  if (filters?.instrument) {
    query.eq("instrument", filters.instrument);
  }
  if (filters?.side) {
    query.eq("side", filters.side);
  }
  if (filters?.start) {
    query.gte("created_at", filters.start);
  }
  if (filters?.end) {
    query.lte("created_at", filters.end);
  }
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 10;
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;
  query.range(from, to);

  const result = await query;
  const data = assertNoError(result, "list trades");
  return { data, total: result.count ?? data.length };
}

export async function getTradeById(id: string) {
  const result = await convex.from("trades").select("*").eq("id", id).single();
  return assertNoError(result, "get trade");
}

export async function listTradesByStatuses(statuses: TradeInsert["status"][]) {
  const result = await convex.from("trades").select("*").in("status", statuses);
  return assertNoError(result, "list trades by status");
}
