import { supabase } from "../client";
import { assertNoError } from "./base";

export async function getOrCreateSource(type: string, identifier: string, displayName?: string) {
  const existing = await supabase
    .from("sources")
    .select("*")
    .eq("type", type)
    .eq("identifier", identifier)
    .maybeSingle();

  if (existing.data) {
    return existing.data;
  }

  const created = await supabase
    .from("sources")
    .insert({ type, identifier, display_name: displayName ?? null })
    .select("*")
    .single();

  return assertNoError(created, "create source");
}

export async function listSourcesByType(type: string) {
  const result = await supabase.from("sources").select("*").eq("type", type).order("created_at");
  return assertNoError(result, "list sources");
}

export async function getSourceById(id: string) {
  const result = await supabase.from("sources").select("*").eq("id", id).single();
  return assertNoError(result, "get source");
}
