import { supabase } from "../client";
import { assertNoError } from "./base";

export async function createSyncRun(sourceId: string) {
  const result = await supabase
    .from("sync_runs")
    .insert({ source_id: sourceId, status: "running" })
    .select("*")
    .single();

  return assertNoError(result, "create sync run");
}

export async function completeSyncRun(
  id: string,
  payload: {
    status: "succeeded" | "failed";
    newCount: number;
    updatedCount: number;
    errorCount: number;
    errorSummary?: string | null;
    coveragePct?: number | null;
    missingFieldsCount?: number | null;
    parseConfidence?: number | null;
  },
) {
  const result = await supabase
    .from("sync_runs")
    .update({
      status: payload.status,
      finished_at: new Date().toISOString(),
      new_count: payload.newCount,
      updated_count: payload.updatedCount,
      error_count: payload.errorCount,
      error_summary: payload.errorSummary ?? null,
      coverage_pct: payload.coveragePct ?? null,
      missing_fields_count: payload.missingFieldsCount ?? null,
      parse_confidence: payload.parseConfidence ?? null,
    })
    .eq("id", id)
    .select("*")
    .single();

  return assertNoError(result, "complete sync run");
}

export async function listSyncRuns(sourceId?: string) {
  const query = supabase.from("sync_runs").select("*").order("started_at", { ascending: false });
  if (sourceId) {
    query.eq("source_id", sourceId);
  }
  const result = await query;
  return assertNoError(result, "list sync runs");
}
