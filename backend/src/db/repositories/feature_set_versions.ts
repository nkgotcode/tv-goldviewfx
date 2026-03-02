import { randomUUID } from "node:crypto";
import {
  getRlOpsRowByField,
  getRlOpsRowById,
  insertRlOpsRow,
  listRlOpsRows,
  requireRlOpsTimescaleEnabled,
  updateRlOpsRowById,
} from "../timescale/rl_ops";

export type FeatureSetVersionInsert = {
  label: string;
  description?: string | null;
};

export async function insertFeatureSetVersion(payload: FeatureSetVersionInsert) {
  requireRlOpsTimescaleEnabled("insertFeatureSetVersion");
  const now = new Date().toISOString();
  return insertRlOpsRow("feature_set_versions", {
    id: randomUUID(),
    created_at: now,
    updated_at: now,
    ...payload,
  });
}

export async function updateFeatureSetVersion(id: string, payload: Partial<FeatureSetVersionInsert>) {
  requireRlOpsTimescaleEnabled("updateFeatureSetVersion");
  return updateRlOpsRowById("feature_set_versions", id, payload);
}

export async function listFeatureSetVersions() {
  requireRlOpsTimescaleEnabled("listFeatureSetVersions");
  return listRlOpsRows("feature_set_versions", {
    orderBy: "created_at",
    direction: "desc",
  });
}

export async function getFeatureSetVersion(id: string) {
  requireRlOpsTimescaleEnabled("getFeatureSetVersion");
  const row = await getRlOpsRowById("feature_set_versions", id);
  if (!row) {
    throw new Error("get feature set version: missing data");
  }
  return row;
}

export async function findFeatureSetVersionByLabel(label: string) {
  requireRlOpsTimescaleEnabled("findFeatureSetVersionByLabel");
  return getRlOpsRowByField("feature_set_versions", "label", label);
}
