import { convex } from "../client";
import { assertNoError } from "./base";

export type DatasetLineageInsert = {
  dataset_id: string;
  source_run_ids?: string[];
  parent_dataset_ids?: string[];
};

export async function insertDatasetLineage(payload: DatasetLineageInsert) {
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
  const result = await convex.from("dataset_lineage").select("*").eq("dataset_id", datasetId).maybeSingle();
  return assertNoError(result, "get dataset lineage");
}
