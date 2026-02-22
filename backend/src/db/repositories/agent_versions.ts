import { randomUUID } from "node:crypto";
import { convex } from "../client";
import { assertNoError } from "./base";
import { getRlOpsRowById, insertRlOpsRow, listRlOpsRows, rlOpsUsesTimescale, updateRlOpsRowById } from "../timescale/rl_ops";

export type AgentVersionInsert = {
  name: string;
  training_window_start?: string | null;
  training_window_end?: string | null;
  algorithm_label?: string | null;
  hyperparameter_summary?: string | null;
  artifact_uri?: string | null;
  artifact_checksum?: string | null;
  artifact_size_bytes?: number | null;
  dataset_version_id?: string | null;
  dataset_hash?: string | null;
  feature_set_version_id?: string | null;
  status?: "draft" | "evaluating" | "promoted" | "retired";
  promoted_at?: string | null;
};

export async function insertAgentVersion(payload: AgentVersionInsert) {
  if (rlOpsUsesTimescale()) {
    const now = new Date().toISOString();
    return insertRlOpsRow("agent_versions", {
      id: randomUUID(),
      status: "draft",
      created_at: now,
      updated_at: now,
      ...payload,
    });
  }
  const result = await convex.from("agent_versions").insert(payload).select("*").single();
  return assertNoError(result, "insert agent version");
}

export async function updateAgentVersion(id: string, payload: Partial<AgentVersionInsert>) {
  if (rlOpsUsesTimescale()) {
    return updateRlOpsRowById("agent_versions", id, payload);
  }
  const result = await convex.from("agent_versions").update(payload).eq("id", id).select("*").single();
  return assertNoError(result, "update agent version");
}

export async function getAgentVersion(id: string) {
  if (rlOpsUsesTimescale()) {
    const row = await getRlOpsRowById("agent_versions", id);
    if (!row) {
      throw new Error("get agent version: missing data");
    }
    return row;
  }
  const result = await convex.from("agent_versions").select("*").eq("id", id).single();
  return assertNoError(result, "get agent version");
}

export async function listAgentVersions(filters: { status?: AgentVersionInsert["status"] } = {}) {
  if (rlOpsUsesTimescale()) {
    const rlOpsFilters: Array<{ field: string; value: unknown }> = filters.status
      ? [{ field: "status", value: filters.status }]
      : [];
    return listRlOpsRows("agent_versions", {
      filters: rlOpsFilters,
      orderBy: "created_at",
      direction: "desc",
    });
  }
  const query = convex.from("agent_versions").select("*").order("created_at", { ascending: false });
  if (filters.status) {
    query.eq("status", filters.status);
  }
  const result = await query;
  return assertNoError(result, "list agent versions");
}
