import { convex } from "../client";
import { assertNoError } from "./base";

export type TradeDecisionInsert = {
  agent_run_id: string;
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
  decided_at?: string;
  action: "long" | "short" | "close" | "hold";
  confidence_score: number;
  inputs_snapshot_id?: string | null;
  policy_version_label?: string | null;
  risk_check_result?: "pass" | "fail";
  reason?: string | null;
  reference_price?: number | null;
  trace_id?: string | null;
};

export async function insertTradeDecision(payload: TradeDecisionInsert) {
  const result = await convex.from("trade_decisions").insert(payload).select("*").single();
  return assertNoError(result, "insert trade decision");
}

export async function listTradeDecisions(agentRunId: string) {
  const result = await convex
    .from("trade_decisions")
    .select("*")
    .eq("agent_run_id", agentRunId)
    .order("decided_at", { ascending: false });

  return assertNoError(result, "list trade decisions");
}

export async function getTradeDecision(id: string) {
  const result = await convex.from("trade_decisions").select("*").eq("id", id).single();
  return assertNoError(result, "get trade decision");
}
