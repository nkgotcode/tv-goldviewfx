import { randomUUID } from "node:crypto";
import { convex } from "../client";
import { assertNoError } from "./base";
import { listRlOpsRows, rlOpsUsesTimescale, upsertRlOpsRow } from "../timescale/rl_ops";

export type SourcePolicyInsert = {
  source_id?: string | null;
  source_type: string;
  enabled?: boolean;
  min_confidence_score?: number | null;
  notes?: string | null;
};

const GLOBAL_SOURCE_ID = "__global__";

function toStoredSourceId(sourceId?: string | null) {
  return sourceId ?? GLOBAL_SOURCE_ID;
}

function fromStoredSourcePolicy<T extends Record<string, unknown>>(row: T): T {
  if (row.source_id === GLOBAL_SOURCE_ID) {
    return { ...row, source_id: null };
  }
  return row;
}

export async function upsertSourcePolicy(payload: SourcePolicyInsert) {
  if (rlOpsUsesTimescale()) {
    const now = new Date().toISOString();
    const row = await upsertRlOpsRow("source_policies", {
      id: randomUUID(),
      source_id: toStoredSourceId(payload.source_id),
      source_type: payload.source_type,
      enabled: payload.enabled ?? true,
      min_confidence_score: payload.min_confidence_score ?? null,
      notes: payload.notes ?? null,
      updated_at: now,
      created_at: now,
    }, ["source_type", "source_id"]);
    return fromStoredSourcePolicy(row);
  }
  const result = await convex
    .from("source_policies")
    .upsert(
      {
        source_id: payload.source_id ?? null,
        source_type: payload.source_type,
        enabled: payload.enabled ?? true,
        min_confidence_score: payload.min_confidence_score ?? null,
        notes: payload.notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "source_id,source_type" },
    )
    .select("*")
    .single();

  return assertNoError(result, "upsert source policy");
}

export async function listSourcePolicies() {
  if (rlOpsUsesTimescale()) {
    const rows = await listRlOpsRows("source_policies", {
      orderBy: "updated_at",
      direction: "desc",
    });
    return rows.map((row) => fromStoredSourcePolicy(row));
  }
  const result = await convex.from("source_policies").select("*").order("updated_at", { ascending: false });
  return assertNoError(result, "list source policies");
}

export async function getSourcePolicy(sourceType: string, sourceId?: string | null) {
  if (rlOpsUsesTimescale()) {
    const rows = await listRlOpsRows("source_policies", {
      filters: [
        { field: "source_type", value: sourceType },
        { field: "source_id", value: toStoredSourceId(sourceId) },
      ],
      limit: 1,
    });
    return rows[0] ? fromStoredSourcePolicy(rows[0]) : null;
  }
  const query = convex.from("source_policies").select("*").eq("source_type", sourceType);
  if (sourceId === undefined || sourceId === null) {
    query.is("source_id", null);
  } else {
    query.eq("source_id", sourceId);
  }
  const result = await query.maybeSingle();
  return result.data;
}
