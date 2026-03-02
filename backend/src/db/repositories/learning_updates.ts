import { randomUUID } from "node:crypto";
import { insertRlOpsRow, listRlOpsRows, requireRlOpsTimescaleEnabled, updateRlOpsRowById } from "../timescale/rl_ops";

export type LearningUpdateInsert = {
  agent_version_id: string;
  window_start: string;
  window_end: string;
  status: "running" | "succeeded" | "failed";
  started_at?: string;
  completed_at?: string | null;
  evaluation_report_id?: string | null;
  champion_evaluation_report_id?: string | null;
  promoted?: boolean | null;
  decision_reasons?: string[];
  metric_deltas?: Record<string, number>;
};

export async function insertLearningUpdate(payload: LearningUpdateInsert) {
  requireRlOpsTimescaleEnabled("insertLearningUpdate");
  const now = new Date().toISOString();
  return insertRlOpsRow("learning_updates", {
    id: randomUUID(),
    started_at: now,
    created_at: now,
    updated_at: now,
    ...payload,
    started_at: payload.started_at ?? now,
    decision_reasons: payload.decision_reasons ?? [],
    metric_deltas: payload.metric_deltas ?? {},
  });
}

export async function updateLearningUpdate(id: string, payload: Partial<LearningUpdateInsert>) {
  requireRlOpsTimescaleEnabled("updateLearningUpdate");
  return updateRlOpsRowById("learning_updates", id, payload);
}

export async function listLearningUpdates(agentVersionId: string) {
  requireRlOpsTimescaleEnabled("listLearningUpdates");
  return listRlOpsRows("learning_updates", {
    filters: [{ field: "agent_version_id", value: agentVersionId }],
    orderBy: "started_at",
    direction: "desc",
  });
}

export async function listRecentLearningUpdates(limit = 5) {
  requireRlOpsTimescaleEnabled("listRecentLearningUpdates");
  const safeLimit = Math.max(1, Math.min(Number(limit), 50));
  return listRlOpsRows("learning_updates", {
    orderBy: "started_at",
    direction: "desc",
    limit: safeLimit,
  });
}

export async function listLearningUpdatesHistory(options: {
  status?: "running" | "succeeded" | "failed";
  limit?: number;
  offset?: number;
} = {}) {
  const limit = Math.max(1, Math.min(options.limit ?? 1000, 10000));
  const offset = Math.max(0, options.offset ?? 0);
  requireRlOpsTimescaleEnabled("listLearningUpdatesHistory");
  const filters = options.status ? [{ field: "status", value: options.status }] : [];
  return listRlOpsRows("learning_updates", {
    filters,
    orderBy: "started_at",
    direction: "desc",
    limit,
    offset,
  });
}
