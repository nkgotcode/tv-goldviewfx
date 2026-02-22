import { randomUUID } from "node:crypto";
import { convex } from "../client";
import { assertNoError } from "./base";
import { getRlOpsRowById, insertRlOpsRow, listRlOpsRows, rlOpsUsesTimescale, updateRlOpsRowById } from "../timescale/rl_ops";

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
  if (rlOpsUsesTimescale()) {
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
  const result = await convex.from("agent_runs").insert(payload).select("*").single();
  return assertNoError(result, "insert agent run");
}

export async function updateAgentRun(id: string, payload: Partial<AgentRunInsert>) {
  if (rlOpsUsesTimescale()) {
    return updateRlOpsRowById("agent_runs", id, payload);
  }
  const result = await convex.from("agent_runs").update(payload).eq("id", id).select("*").single();
  return assertNoError(result, "update agent run");
}

export async function getAgentRun(id: string) {
  if (rlOpsUsesTimescale()) {
    const row = await getRlOpsRowById("agent_runs", id);
    if (!row) {
      throw new Error("get agent run: missing data");
    }
    return row;
  }
  const result = await convex.from("agent_runs").select("*").eq("id", id).single();
  return assertNoError(result, "get agent run");
}

export async function listAgentRuns(filters: {
  pair?: AgentRunInsert["pair"];
  status?: AgentRunInsert["status"];
  mode?: AgentRunInsert["mode"];
} = {}) {
  if (rlOpsUsesTimescale()) {
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
  const query = convex.from("agent_runs").select("*").order("started_at", { ascending: false });
  if (filters.pair) {
    query.eq("pair", filters.pair);
  }
  if (filters.status) {
    query.eq("status", filters.status);
  }
  if (filters.mode) {
    query.eq("mode", filters.mode);
  }
  const result = await query;
  return assertNoError(result, "list agent runs");
}
