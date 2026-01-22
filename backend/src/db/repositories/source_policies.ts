import { supabase } from "../client";
import { assertNoError } from "./base";

export type SourcePolicyInsert = {
  source_id?: string | null;
  source_type: string;
  enabled?: boolean;
  min_confidence_score?: number | null;
  notes?: string | null;
};

export async function upsertSourcePolicy(payload: SourcePolicyInsert) {
  const result = await supabase
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
  const result = await supabase.from("source_policies").select("*").order("updated_at", { ascending: false });
  return assertNoError(result, "list source policies");
}

export async function getSourcePolicy(sourceType: string, sourceId?: string | null) {
  const query = supabase.from("source_policies").select("*").eq("source_type", sourceType);
  if (sourceId === undefined || sourceId === null) {
    query.is("source_id", null);
  } else {
    query.eq("source_id", sourceId);
  }
  const result = await query.maybeSingle();
  return result.data;
}
