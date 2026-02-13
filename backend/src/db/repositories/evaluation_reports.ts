import { convex } from "../client";
import { assertNoError } from "./base";

export type EvaluationReportInsert = {
  agent_version_id: string;
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
  period_start: string;
  period_end: string;
  dataset_version_id?: string | null;
  dataset_hash?: string | null;
  feature_set_version_id?: string | null;
  artifact_uri?: string | null;
  backtest_run_id?: string | null;
  win_rate: number;
  net_pnl_after_fees: number;
  max_drawdown: number;
  trade_count: number;
  exposure_by_pair: Record<string, number>;
  status: "pass" | "fail";
};

export async function insertEvaluationReport(payload: EvaluationReportInsert) {
  const result = await convex.from("evaluation_reports").insert(payload).select("*").single();
  return assertNoError(result, "insert evaluation report");
}

export async function listEvaluationReports(agentVersionId?: string) {
  const query = convex.from("evaluation_reports").select("*").order("created_at", { ascending: false });
  if (agentVersionId) {
    query.eq("agent_version_id", agentVersionId);
  }
  const result = await query;
  return assertNoError(result, "list evaluation reports");
}

export async function getEvaluationReport(id: string) {
  const result = await convex.from("evaluation_reports").select("*").eq("id", id).single();
  return assertNoError(result, "get evaluation report");
}

export async function getLatestEvaluationReport(filters: { agentVersionId?: string; pair?: string } = {}) {
  const query = convex.from("evaluation_reports").select("*").order("created_at", { ascending: false }).limit(1);
  if (filters.agentVersionId) {
    query.eq("agent_version_id", filters.agentVersionId);
  }
  if (filters.pair) {
    query.eq("pair", filters.pair);
  }
  const result = await query.maybeSingle();
  if (result.error) {
    throw result.error;
  }
  return result.data ?? null;
}
