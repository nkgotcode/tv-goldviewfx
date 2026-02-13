import { convex } from "../client";
import { assertNoError } from "./base";

export type TradeExecutionInsert = {
  trade_id: string;
  trade_decision_id?: string | null;
  execution_kind?: "entry" | "exit" | "cancel";
  exchange_order_id: string | null;
  client_order_id?: string | null;
  idempotency_key?: string | null;
  trace_id?: string | null;
  execution_mode?: "paper" | "live";
  requested_instrument?: string | null;
  requested_side?: "long" | "short" | null;
  requested_quantity?: number | null;
  filled_quantity: number;
  average_price: number;
  status: "submitted" | "partial" | "filled" | "failed" | "cancelled";
  status_reason?: string | null;
  reconciled_at?: string | null;
  reconciliation_status?: "pending" | "ok" | "mismatch" | "error" | null;
  attempt_count?: number | null;
  last_attempt_at?: string | null;
};

export async function insertTradeExecution(payload: TradeExecutionInsert) {
  const result = await convex.from("trade_executions").insert(payload).select("*").single();
  return assertNoError(result, "insert trade execution");
}

export async function updateTradeExecution(id: string, payload: Partial<TradeExecutionInsert>) {
  const result = await convex
    .from("trade_executions")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  return assertNoError(result, "update trade execution");
}

export async function getTradeExecutionById(id: string) {
  const result = await convex.from("trade_executions").select("*").eq("id", id).single();
  return assertNoError(result, "get trade execution");
}

export async function findTradeExecutionByIdempotencyKey(key: string) {
  const result = await convex.from("trade_executions").select("*").eq("idempotency_key", key).maybeSingle();
  if (result.error) {
    throw new Error(`find trade execution by idempotency key: ${result.error.message}`);
  }
  return result.data;
}

export async function listTradeExecutions(tradeId: string) {
  const result = await convex
    .from("trade_executions")
    .select("*")
    .eq("trade_id", tradeId)
    .order("executed_at", { ascending: false });

  return assertNoError(result, "list trade executions");
}

export async function listTradeExecutionsByDecision(tradeDecisionId: string) {
  const result = await convex
    .from("trade_executions")
    .select("*")
    .eq("trade_decision_id", tradeDecisionId)
    .order("executed_at", { ascending: false });

  return assertNoError(result, "list trade executions by decision");
}

export async function listPendingTradeExecutions(options?: { limit?: number }) {
  const query = convex
    .from("trade_executions")
    .select("*")
    .in("status", ["submitted", "partial"]);

  if (options?.limit) {
    query.limit(options.limit);
  }

  const result = await query;
  return assertNoError(result, "list pending trade executions");
}
