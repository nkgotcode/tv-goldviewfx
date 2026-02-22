import { randomUUID } from "node:crypto";
import { convex } from "../client";
import { assertNoError } from "./base";
import { getRlOpsRowById, listRlOpsRows, rlOpsUsesTimescale, upsertRlOpsRow, updateRlOpsRowById } from "../timescale/rl_ops";

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
  if (rlOpsUsesTimescale()) {
    const now = new Date().toISOString();
    return insertOrUpdateTradeExecution({
      id: randomUUID(),
      executed_at: now,
      created_at: now,
      updated_at: now,
      ...payload,
    });
  }
  const result = await convex.from("trade_executions").insert(payload).select("*").single();
  return assertNoError(result, "insert trade execution");
}

export async function updateTradeExecution(id: string, payload: Partial<TradeExecutionInsert>) {
  if (rlOpsUsesTimescale()) {
    return updateRlOpsRowById("trade_executions", id, {
      ...payload,
      updated_at: new Date().toISOString(),
    });
  }
  const result = await convex
    .from("trade_executions")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  return assertNoError(result, "update trade execution");
}

export async function getTradeExecutionById(id: string) {
  if (rlOpsUsesTimescale()) {
    const row = await getRlOpsRowById("trade_executions", id);
    if (!row) {
      throw new Error("get trade execution: missing data");
    }
    return row;
  }
  const result = await convex.from("trade_executions").select("*").eq("id", id).single();
  return assertNoError(result, "get trade execution");
}

export async function findTradeExecutionByIdempotencyKey(key: string) {
  if (rlOpsUsesTimescale()) {
    const rows = await listRlOpsRows("trade_executions", {
      filters: [{ field: "idempotency_key", value: key }],
      limit: 1,
    });
    return rows[0] ?? null;
  }
  const result = await convex.from("trade_executions").select("*").eq("idempotency_key", key).maybeSingle();
  if (result.error) {
    throw new Error(`find trade execution by idempotency key: ${result.error.message}`);
  }
  return result.data;
}

export async function listTradeExecutions(tradeId: string) {
  if (rlOpsUsesTimescale()) {
    return listRlOpsRows("trade_executions", {
      filters: [{ field: "trade_id", value: tradeId }],
      orderBy: "executed_at",
      direction: "desc",
    });
  }
  const result = await convex
    .from("trade_executions")
    .select("*")
    .eq("trade_id", tradeId)
    .order("executed_at", { ascending: false });

  return assertNoError(result, "list trade executions");
}

export async function listTradeExecutionsByDecision(tradeDecisionId: string) {
  if (rlOpsUsesTimescale()) {
    return listRlOpsRows("trade_executions", {
      filters: [{ field: "trade_decision_id", value: tradeDecisionId }],
      orderBy: "executed_at",
      direction: "desc",
    });
  }
  const result = await convex
    .from("trade_executions")
    .select("*")
    .eq("trade_decision_id", tradeDecisionId)
    .order("executed_at", { ascending: false });

  return assertNoError(result, "list trade executions by decision");
}

export async function listPendingTradeExecutions(options?: { limit?: number }) {
  if (rlOpsUsesTimescale()) {
    return listRlOpsRows("trade_executions", {
      filters: [{ field: "status", op: "in", value: ["submitted", "partial"] }],
      orderBy: "executed_at",
      direction: "desc",
      limit: options?.limit,
    });
  }
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

async function insertOrUpdateTradeExecution(payload: Record<string, unknown>) {
  if (payload.idempotency_key) {
    return upsertRlOpsRow("trade_executions", payload, ["idempotency_key"]);
  }
  return upsertRlOpsRow("trade_executions", payload, ["id"]);
}
