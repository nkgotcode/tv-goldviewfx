import { randomUUID } from "node:crypto";
import { convex } from "../client";
import { assertNoError } from "./base";
import { getRlOpsRowById, insertRlOpsRow, listRlOpsRows, rlOpsUsesTimescale } from "../timescale/rl_ops";

export type TradeDecisionInsert = {
  agent_run_id: string;
  pair: string;
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
  if (rlOpsUsesTimescale()) {
    const now = new Date().toISOString();
    return insertRlOpsRow("trade_decisions", {
      id: randomUUID(),
      decided_at: now,
      created_at: now,
      updated_at: now,
      ...payload,
      decided_at: payload.decided_at ?? now,
    });
  }
  const result = await convex.from("trade_decisions").insert(payload).select("*").single();
  return assertNoError(result, "insert trade decision");
}

export async function listTradeDecisions(agentRunId: string) {
  if (rlOpsUsesTimescale()) {
    return listRlOpsRows("trade_decisions", {
      filters: [{ field: "agent_run_id", value: agentRunId }],
      orderBy: "decided_at",
      direction: "desc",
    });
  }
  const result = await convex
    .from("trade_decisions")
    .select("*")
    .eq("agent_run_id", agentRunId)
    .order("decided_at", { ascending: false });

  return assertNoError(result, "list trade decisions");
}

export async function getTradeDecision(id: string) {
  if (rlOpsUsesTimescale()) {
    const row = await getRlOpsRowById("trade_decisions", id);
    if (!row) {
      throw new Error("get trade decision: missing data");
    }
    return row;
  }
  const result = await convex.from("trade_decisions").select("*").eq("id", id).single();
  return assertNoError(result, "get trade decision");
}
