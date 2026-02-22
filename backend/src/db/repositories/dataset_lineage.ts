import { randomUUID } from "node:crypto";
import { convex } from "../client";
import { assertNoError } from "./base";
import { listRlOpsRows, rlOpsUsesTimescale, upsertRlOpsRow } from "../timescale/rl_ops";

export type DatasetLineageInsert = {
  dataset_id: string;
  source_run_ids?: string[];
  parent_dataset_ids?: string[];
};

export async function insertDatasetLineage(payload: DatasetLineageInsert) {
  if (rlOpsUsesTimescale()) {
    const now = new Date().toISOString();
    return upsertRlOpsRow(
      "dataset_lineage",
      {
        id: randomUUID(),
        dataset_id: payload.dataset_id,
        source_run_ids: payload.source_run_ids ?? [],
        parent_dataset_ids: payload.parent_dataset_ids ?? [],
        created_at: now,
        updated_at: now,
      },
      ["dataset_id"],
    );
  }
  const result = await convex
    .from("dataset_lineage")
    .insert({
      dataset_id: payload.dataset_id,
      source_run_ids: payload.source_run_ids ?? [],
      parent_dataset_ids: payload.parent_dataset_ids ?? [],
    })
    .select("*")
    .single();
  return assertNoError(result, "insert dataset lineage");
}

export async function getDatasetLineage(datasetId: string) {
  if (rlOpsUsesTimescale()) {
    const rows = await listRlOpsRows("dataset_lineage", {
      filters: [{ field: "dataset_id", value: datasetId }],
      limit: 1,
    });
    if (!rows[0]) return null;
    return rows[0];
  }
  const result = await convex.from("dataset_lineage").select("*").eq("dataset_id", datasetId).maybeSingle();
  return assertNoError(result, "get dataset lineage");
}
