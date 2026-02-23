import { randomUUID } from "node:crypto";
import { convex } from "../client";
import { assertNoError } from "./base";
import { insertRlOpsRow, listRlOpsRows, rlOpsUsesTimescale, updateRlOpsRowById } from "../timescale/rl_ops";

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
  if (rlOpsUsesTimescale()) {
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
  const result = await convex.from("learning_updates").insert(payload).select("*").single();
  return assertNoError(result, "insert learning update");
}

export async function updateLearningUpdate(id: string, payload: Partial<LearningUpdateInsert>) {
  if (rlOpsUsesTimescale()) {
    return updateRlOpsRowById("learning_updates", id, payload);
  }
  const result = await convex.from("learning_updates").update(payload).eq("id", id).select("*").single();
  return assertNoError(result, "update learning update");
}

export async function listLearningUpdates(agentVersionId: string) {
  if (rlOpsUsesTimescale()) {
    return listRlOpsRows("learning_updates", {
      filters: [{ field: "agent_version_id", value: agentVersionId }],
      orderBy: "started_at",
      direction: "desc",
    });
  }
  const result = await convex
    .from("learning_updates")
    .select("*")
    .eq("agent_version_id", agentVersionId)
    .order("started_at", { ascending: false });
  return assertNoError(result, "list learning updates");
}

export async function listRecentLearningUpdates(limit = 5) {
  if (rlOpsUsesTimescale()) {
    return listRlOpsRows("learning_updates", {
      orderBy: "started_at",
      direction: "desc",
      limit,
    });
  }
  const result = await convex
    .from("learning_updates")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  return assertNoError(result, "list recent learning updates");
}

export async function listLearningUpdatesHistory(options: {
  status?: "running" | "succeeded" | "failed";
  limit?: number;
} = {}) {
  const limit = Math.max(1, Math.min(options.limit ?? 1000, 10000));
  if (rlOpsUsesTimescale()) {
    const filters = options.status ? [{ field: "status", value: options.status }] : [];
    return listRlOpsRows("learning_updates", {
      filters,
      orderBy: "started_at",
      direction: "desc",
      limit,
    });
  }

  const query = convex.from("learning_updates").select("*").order("started_at", { ascending: false }).limit(limit);
  if (options.status) {
    query.eq("status", options.status);
  }
  const result = await query;
  return assertNoError(result, "list learning updates history");
}
