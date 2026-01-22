import { supabase } from "../client";
import { assertNoError } from "./base";

export type TradeExecutionInsert = {
  trade_id: string;
  trade_decision_id?: string | null;
  exchange_order_id: string | null;
  filled_quantity: number;
  average_price: number;
  status: "partial" | "filled" | "failed";
};

export async function insertTradeExecution(payload: TradeExecutionInsert) {
  const result = await supabase.from("trade_executions").insert(payload).select("*").single();
  return assertNoError(result, "insert trade execution");
}

export async function listTradeExecutions(tradeId: string) {
  const result = await supabase
    .from("trade_executions")
    .select("*")
    .eq("trade_id", tradeId)
    .order("executed_at", { ascending: false });

  return assertNoError(result, "list trade executions");
}

export async function listTradeExecutionsByDecision(tradeDecisionId: string) {
  const result = await supabase
    .from("trade_executions")
    .select("*")
    .eq("trade_decision_id", tradeDecisionId)
    .order("executed_at", { ascending: false });

  return assertNoError(result, "list trade executions by decision");
}
