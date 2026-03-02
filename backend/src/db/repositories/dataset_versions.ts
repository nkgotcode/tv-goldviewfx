import { randomUUID } from "node:crypto";
import { getRlOpsRowById, insertRlOpsRow, listRlOpsRows, requireRlOpsTimescaleEnabled } from "../timescale/rl_ops";

export type DatasetVersionInsert = {
  pair: string;
  interval: string;
  start_at: string;
  end_at: string;
  checksum: string;
  dataset_hash?: string | null;
  window_size?: number | null;
  stride?: number | null;
  feature_set_version_id?: string | null;
  feature_schema_fingerprint?: string | null;
};

export async function insertDatasetVersion(payload: DatasetVersionInsert) {
  requireRlOpsTimescaleEnabled("insertDatasetVersion");
  const now = new Date().toISOString();
  return insertRlOpsRow("dataset_versions", {
    id: randomUUID(),
    created_at: now,
    ...payload,
  });
}

export async function listDatasetVersions() {
  requireRlOpsTimescaleEnabled("listDatasetVersions");
  return listRlOpsRows("dataset_versions", {
    orderBy: "created_at",
    direction: "desc",
  });
}

export async function getDatasetVersion(id: string) {
  requireRlOpsTimescaleEnabled("getDatasetVersion");
  const row = await getRlOpsRowById("dataset_versions", id);
  if (!row) {
    throw new Error("get dataset version: missing data");
  }
  return row;
}
