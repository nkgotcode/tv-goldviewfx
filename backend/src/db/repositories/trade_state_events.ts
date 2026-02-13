import { convex } from "../client";
import { assertNoError } from "./base";

export type TradeStateEventInsert = {
  entity_type: "trade" | "execution";
  trade_id?: string | null;
  trade_execution_id?: string | null;
  from_status: string | null;
  to_status: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  recorded_at?: string;
};

export async function insertTradeStateEvent(payload: TradeStateEventInsert) {
  const result = await convex
    .from("trade_state_events")
    .insert({
      entity_type: payload.entity_type,
      trade_id: payload.trade_id ?? null,
      trade_execution_id: payload.trade_execution_id ?? null,
      from_status: payload.from_status,
      to_status: payload.to_status,
      reason: payload.reason ?? null,
      metadata: payload.metadata ?? {},
      recorded_at: payload.recorded_at ?? new Date().toISOString(),
    })
    .select("*")
    .single();

  return assertNoError(result, "insert trade state event");
}

export async function listTradeStateEvents(options?: { tradeId?: string; executionId?: string; limit?: number }) {
  const query = convex.from("trade_state_events").select("*").order("recorded_at", { ascending: false });
  if (options?.tradeId) {
    query.eq("trade_id", options.tradeId);
  }
  if (options?.executionId) {
    query.eq("trade_execution_id", options.executionId);
  }
  if (options?.limit) {
    query.limit(options.limit);
  }
  const result = await query;
  return assertNoError(result, "list trade state events");
}
