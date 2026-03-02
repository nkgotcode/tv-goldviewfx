import { randomUUID } from "node:crypto";
import {
  getRlOpsRowById,
  insertRlOpsRow,
  listRlOpsRows,
  requireRlOpsTimescaleEnabled,
  updateRlOpsRowById,
} from "../timescale/rl_ops";

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
  requireRlOpsTimescaleEnabled("insertAgentVersion");
  const now = new Date().toISOString();
  return insertRlOpsRow("agent_versions", {
    id: randomUUID(),
    status: "draft",
    created_at: now,
    updated_at: now,
    ...payload,
  });
}

export async function updateAgentVersion(id: string, payload: Partial<AgentVersionInsert>) {
  requireRlOpsTimescaleEnabled("updateAgentVersion");
  return updateRlOpsRowById("agent_versions", id, payload);
}

export async function getAgentVersion(id: string) {
  requireRlOpsTimescaleEnabled("getAgentVersion");
  const row = await getRlOpsRowById("agent_versions", id);
  if (!row) {
    throw new Error("get agent version: missing data");
  }
  return row;
}

export async function listAgentVersions(filters: { status?: AgentVersionInsert["status"] } = {}) {
  requireRlOpsTimescaleEnabled("listAgentVersions");
  const rlOpsFilters: Array<{ field: string; value: unknown }> = filters.status
    ? [{ field: "status", value: filters.status }]
    : [];
  return listRlOpsRows("agent_versions", {
    filters: rlOpsFilters,
    orderBy: "created_at",
    direction: "desc",
  });
}
