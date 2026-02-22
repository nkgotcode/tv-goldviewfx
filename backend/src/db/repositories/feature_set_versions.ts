import { randomUUID } from "node:crypto";
import { convex } from "../client";
import { assertNoError } from "./base";
import { getRlOpsRowByField, getRlOpsRowById, insertRlOpsRow, listRlOpsRows, rlOpsUsesTimescale, updateRlOpsRowById } from "../timescale/rl_ops";

export type FeatureSetVersionInsert = {
  label: string;
  description?: string | null;
};

export async function insertFeatureSetVersion(payload: FeatureSetVersionInsert) {
  if (rlOpsUsesTimescale()) {
    const now = new Date().toISOString();
    return insertRlOpsRow("feature_set_versions", {
      id: randomUUID(),
      created_at: now,
      updated_at: now,
      ...payload,
    });
  }
  const result = await convex.from("feature_set_versions").insert(payload).select("*").single();
  return assertNoError(result, "insert feature set version");
}

export async function updateFeatureSetVersion(id: string, payload: Partial<FeatureSetVersionInsert>) {
  if (rlOpsUsesTimescale()) {
    return updateRlOpsRowById("feature_set_versions", id, payload);
  }
  const result = await convex.from("feature_set_versions").update(payload).eq("id", id).select("*").single();
  return assertNoError(result, "update feature set version");
}

export async function listFeatureSetVersions() {
  if (rlOpsUsesTimescale()) {
    return listRlOpsRows("feature_set_versions", {
      orderBy: "created_at",
      direction: "desc",
    });
  }
  const result = await convex.from("feature_set_versions").select("*").order("created_at", { ascending: false });
  return assertNoError(result, "list feature set versions");
}

export async function getFeatureSetVersion(id: string) {
  if (rlOpsUsesTimescale()) {
    const row = await getRlOpsRowById("feature_set_versions", id);
    if (!row) {
      throw new Error("get feature set version: missing data");
    }
    return row;
  }
  const result = await convex.from("feature_set_versions").select("*").eq("id", id).single();
  return assertNoError(result, "get feature set version");
}

export async function findFeatureSetVersionByLabel(label: string) {
  if (rlOpsUsesTimescale()) {
    return getRlOpsRowByField("feature_set_versions", "label", label);
  }
  const result = await convex.from("feature_set_versions").select("*").eq("label", label).maybeSingle();
  return result.data ?? null;
}
