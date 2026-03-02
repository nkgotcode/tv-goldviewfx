import { randomUUID } from "node:crypto";
import {
  getRlOpsRowById,
  insertRlOpsRow,
  listRlOpsRows,
  requireRlOpsTimescaleEnabled,
} from "../timescale/rl_ops";
import { getTimescaleSql } from "../timescale/client";

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

type EvaluationReportRow = EvaluationReportInsert & {
  id: string;
  created_at: string;
  updated_at: string;
};

export async function insertEvaluationReport(payload: EvaluationReportInsert) {
  requireRlOpsTimescaleEnabled("insertEvaluationReport");
  const now = new Date().toISOString();
  return insertRlOpsRow("evaluation_reports", {
    id: randomUUID(),
    created_at: now,
    updated_at: now,
    ...payload,
  });
}

export async function listEvaluationReports(
  agentVersionId?: string,
  options: { limit?: number; offset?: number } = {},
) {
  requireRlOpsTimescaleEnabled("listEvaluationReports");
  const filters: Array<{ field: string; value: unknown }> = agentVersionId
    ? [{ field: "agent_version_id", value: agentVersionId }]
    : [];
  return listRlOpsRows("evaluation_reports", {
    filters,
    orderBy: "created_at",
    direction: "desc",
    limit: options.limit,
    offset: options.offset,
  });
}

export async function getEvaluationReport(id: string) {
  requireRlOpsTimescaleEnabled("getEvaluationReport");
  const row = await getRlOpsRowById("evaluation_reports", id);
  if (!row) {
    throw new Error("get evaluation report: missing data");
  }
  return row;
}

export async function getLatestEvaluationReport(filters: { agentVersionId?: string; pair?: string } = {}) {
  requireRlOpsTimescaleEnabled("getLatestEvaluationReport");
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

export async function getLatestEvaluationReportsByPairs(pairs: string[]) {
  requireRlOpsTimescaleEnabled("getLatestEvaluationReportsByPairs");
  const normalizedPairs = Array.from(new Set(pairs.filter(Boolean)));
  if (normalizedPairs.length === 0) {
    return [];
  }
  const sql = getTimescaleSql("TIMESCALE_RL_OPS_ENABLED=true");
  const rows = (await sql`
    select *
    from (
      select *, row_number() over (partition by pair order by created_at desc) as rn
      from evaluation_reports
      where pair = any(${normalizedPairs})
    ) ranked
    where rn = 1
    order by pair asc
  `) as EvaluationReportRow[];
  return rows;
}
