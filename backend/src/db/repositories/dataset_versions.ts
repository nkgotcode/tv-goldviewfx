import { supabase } from "../client";
import { assertNoError } from "./base";

export type DatasetVersionInsert = {
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
  interval: string;
  start_at: string;
  end_at: string;
  checksum: string;
  feature_set_version_id?: string | null;
};

export async function insertDatasetVersion(payload: DatasetVersionInsert) {
  const result = await supabase.from("dataset_versions").insert(payload).select("*").single();
  return assertNoError(result, "insert dataset version");
}

export async function listDatasetVersions() {
  const result = await supabase.from("dataset_versions").select("*").order("created_at", { ascending: false });
  return assertNoError(result, "list dataset versions");
}

export async function getDatasetVersion(id: string) {
  const result = await supabase.from("dataset_versions").select("*").eq("id", id).single();
  return assertNoError(result, "get dataset version");
}
