import { supabase } from "../client";
import { assertNoError } from "./base";

export type FeatureSetVersionInsert = {
  label: string;
  description?: string | null;
};

export async function insertFeatureSetVersion(payload: FeatureSetVersionInsert) {
  const result = await supabase.from("feature_set_versions").insert(payload).select("*").single();
  return assertNoError(result, "insert feature set version");
}

export async function listFeatureSetVersions() {
  const result = await supabase.from("feature_set_versions").select("*").order("created_at", { ascending: false });
  return assertNoError(result, "list feature set versions");
}

export async function getFeatureSetVersion(id: string) {
  const result = await supabase.from("feature_set_versions").select("*").eq("id", id).single();
  return assertNoError(result, "get feature set version");
}

export async function findFeatureSetVersionByLabel(label: string) {
  const result = await supabase.from("feature_set_versions").select("*").eq("label", label).maybeSingle();
  return result.data ?? null;
}
