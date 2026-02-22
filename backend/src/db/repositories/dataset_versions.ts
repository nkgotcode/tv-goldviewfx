import { randomUUID } from "node:crypto";
import { convex } from "../client";
import { assertNoError } from "./base";
import { getRlOpsRowById, insertRlOpsRow, listRlOpsRows, rlOpsUsesTimescale } from "../timescale/rl_ops";

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
  if (rlOpsUsesTimescale()) {
    const now = new Date().toISOString();
    return insertRlOpsRow("dataset_versions", {
      id: randomUUID(),
      created_at: now,
      ...payload,
    });
  }
  const result = await convex.from("dataset_versions").insert(payload).select("*").single();
  return assertNoError(result, "insert dataset version");
}

export async function listDatasetVersions() {
  if (rlOpsUsesTimescale()) {
    return listRlOpsRows("dataset_versions", {
      orderBy: "created_at",
      direction: "desc",
    });
  }
  const result = await convex.from("dataset_versions").select("*").order("created_at", { ascending: false });
  return assertNoError(result, "list dataset versions");
}

export async function getDatasetVersion(id: string) {
  if (rlOpsUsesTimescale()) {
    const row = await getRlOpsRowById("dataset_versions", id);
    if (!row) {
      throw new Error("get dataset version: missing data");
    }
    return row;
  }
  const result = await convex.from("dataset_versions").select("*").eq("id", id).single();
  return assertNoError(result, "get dataset version");
}
