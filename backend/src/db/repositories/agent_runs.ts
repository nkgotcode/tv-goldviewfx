import { randomUUID } from "node:crypto";
import {
  getRlOpsRowById,
  insertRlOpsRow,
  listRlOpsRows,
  requireRlOpsTimescaleEnabled,
  updateRlOpsRowById,
} from "../timescale/rl_ops";

export type AgentRunInsert = {
  mode: "paper" | "live";
  pair: string;
  status: "running" | "paused" | "stopped";
  learning_enabled?: boolean;
  learning_window_minutes?: number | null;
  agent_version_id: string;
  risk_limit_set_id: string;
  dataset_version_id?: string | null;
  feature_set_version_id?: string | null;
  started_at?: string;
  stopped_at?: string | null;
};

export async function insertAgentRun(payload: AgentRunInsert) {
  requireRlOpsTimescaleEnabled("insertAgentRun");
  const now = new Date().toISOString();
  return insertRlOpsRow("agent_runs", {
    id: randomUUID(),
    learning_enabled: true,
    started_at: now,
    created_at: now,
    updated_at: now,
    ...payload,
    started_at: payload.started_at ?? now,
  });
}

export async function updateAgentRun(id: string, payload: Partial<AgentRunInsert>) {
  requireRlOpsTimescaleEnabled("updateAgentRun");
  return updateRlOpsRowById("agent_runs", id, payload);
}

export async function getAgentRun(id: string) {
  requireRlOpsTimescaleEnabled("getAgentRun");
  const row = await getRlOpsRowById("agent_runs", id);
  if (!row) {
    throw new Error("get agent run: missing data");
  }
  return row;
}

export async function listAgentRuns(filters: {
  pair?: AgentRunInsert["pair"];
  status?: AgentRunInsert["status"];
  mode?: AgentRunInsert["mode"];
} = {}) {
  requireRlOpsTimescaleEnabled("listAgentRuns");
  const rlOpsFilters: Array<{ field: string; value: unknown }> = [];
  if (filters.pair) rlOpsFilters.push({ field: "pair", value: filters.pair });
  if (filters.status) rlOpsFilters.push({ field: "status", value: filters.status });
  if (filters.mode) rlOpsFilters.push({ field: "mode", value: filters.mode });
  return listRlOpsRows("agent_runs", {
    filters: rlOpsFilters,
    orderBy: "started_at",
    direction: "desc",
  });
}
