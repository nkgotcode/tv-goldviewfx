import { randomUUID } from "node:crypto";
import { convex } from "../client";
import { assertNoError } from "./base";
import {
  getRlOpsRowById,
  insertRlOpsRow,
  listRlOpsRows,
  rlOpsUsesTimescale,
} from "../timescale/rl_ops";

export type EvaluationReportInsert = {
  agent_version_id: string;
  pair: string;
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
  metadata?: Record<string, unknown> | null;
  status: "pass" | "fail";
};

export async function insertEvaluationReport(payload: EvaluationReportInsert) {
  if (rlOpsUsesTimescale()) {
    const now = new Date().toISOString();
    return insertRlOpsRow("evaluation_reports", {
      id: randomUUID(),
      created_at: now,
      updated_at: now,
      ...payload,
    });
  }
  const result = await convex.from("evaluation_reports").insert(payload).select("*").single();
  return assertNoError(result, "insert evaluation report");
}

export async function listEvaluationReports(agentVersionId?: string) {
  if (rlOpsUsesTimescale()) {
    const filters: Array<{ field: string; value: unknown }> = agentVersionId
      ? [{ field: "agent_version_id", value: agentVersionId }]
      : [];
    return listRlOpsRows("evaluation_reports", {
      filters,
      orderBy: "created_at",
      direction: "desc",
    });
  }
  const query = convex.from("evaluation_reports").select("*").order("created_at", { ascending: false });
  if (agentVersionId) {
    query.eq("agent_version_id", agentVersionId);
  }
  const result = await query;
  return assertNoError(result, "list evaluation reports");
}

export async function getEvaluationReport(id: string) {
  if (rlOpsUsesTimescale()) {
    const row = await getRlOpsRowById("evaluation_reports", id);
    if (!row) {
      throw new Error("get evaluation report: missing data");
    }
    return row;
  }
  const result = await convex.from("evaluation_reports").select("*").eq("id", id).single();
  return assertNoError(result, "get evaluation report");
}

export async function getLatestEvaluationReport(filters: { agentVersionId?: string; pair?: string } = {}) {
  if (rlOpsUsesTimescale()) {
    const rlOpsFilters: Array<{ field: string; value: unknown }> = [];
    if (filters.agentVersionId) {
      rlOpsFilters.push({ field: "agent_version_id", value: filters.agentVersionId });
    }
    if (filters.pair) {
      rlOpsFilters.push({ field: "pair", value: filters.pair });
    }
    const rows = await listRlOpsRows("evaluation_reports", {
      filters: rlOpsFilters,
      orderBy: "created_at",
      direction: "desc",
      limit: 1,
    });
    return rows[0] ?? null;
  }
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
