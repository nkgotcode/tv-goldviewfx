import { convex } from "../client";
import { assertNoError } from "./base";

export type EnrichmentRunInsert = {
  trigger: "manual" | "schedule" | string;
};

export async function createEnrichmentRun(payload: EnrichmentRunInsert) {
  const result = await convex
    .from("enrichment_runs")
    .insert({ trigger: payload.trigger, status: "running" })
    .select("*")
    .single();
  return assertNoError(result, "create enrichment run");
}

export async function completeEnrichmentRun(
  id: string,
  payload: { status: "succeeded" | "failed"; processedCount: number; errorCount: number; errorSummary?: string | null },
) {
  const result = await convex
    .from("enrichment_runs")
    .update({
      status: payload.status,
      finished_at: new Date().toISOString(),
      processed_count: payload.processedCount,
      error_count: payload.errorCount,
      error_summary: payload.errorSummary ?? null,
    })
    .eq("id", id)
    .select("*")
    .single();
  return assertNoError(result, "complete enrichment run");
}

export async function insertEnrichmentRevision(payload: {
  enrichment_id: string;
  idea_id?: string | null;
  run_id?: string | null;
  previous_payload?: Record<string, unknown> | null;
  next_payload?: Record<string, unknown> | null;
  diff_summary?: Record<string, unknown> | null;
}) {
  const result = await convex
    .from("enrichment_revisions")
    .insert({
      enrichment_id: payload.enrichment_id,
      idea_id: payload.idea_id ?? null,
      run_id: payload.run_id ?? null,
      previous_payload: payload.previous_payload ?? null,
      next_payload: payload.next_payload ?? null,
      diff_summary: payload.diff_summary ?? null,
    })
    .select("*")
    .single();

  return assertNoError(result, "insert enrichment revision");
}

export async function listEnrichmentRevisions(enrichmentId: string) {
  const result = await convex
    .from("enrichment_revisions")
    .select("*")
    .eq("enrichment_id", enrichmentId)
    .order("created_at", { ascending: false });
  return assertNoError(result, "list enrichment revisions");
}
