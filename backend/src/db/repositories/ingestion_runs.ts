import { supabase } from "../client";
import { assertNoError } from "./base";

export type IngestionRunInsert = {
  source_type: string;
  source_id?: string | null;
  feed?: string | null;
  trigger: string;
  status: "running" | "succeeded" | "failed";
  new_count?: number;
  updated_count?: number;
  error_count?: number;
  error_summary?: string | null;
  coverage_pct?: number | null;
  missing_fields_count?: number | null;
  parse_confidence?: number | null;
};

export async function createIngestionRun(payload: IngestionRunInsert) {
  const result = await supabase
    .from("ingestion_runs")
    .insert({
      source_type: payload.source_type,
      source_id: payload.source_id ?? null,
      feed: payload.feed ?? null,
      trigger: payload.trigger,
      status: payload.status,
      new_count: payload.new_count ?? 0,
      updated_count: payload.updated_count ?? 0,
      error_count: payload.error_count ?? 0,
      error_summary: payload.error_summary ?? null,
      coverage_pct: payload.coverage_pct ?? null,
      missing_fields_count: payload.missing_fields_count ?? null,
      parse_confidence: payload.parse_confidence ?? null,
    })
    .select("*")
    .single();

  return assertNoError(result, "create ingestion run");
}

export async function completeIngestionRun(
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
    .from("ingestion_runs")
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

  return assertNoError(result, "complete ingestion run");
}

export async function listIngestionRuns(filters?: {
  sourceType?: string;
  sourceId?: string | null;
  feed?: string | null;
  page?: number;
  pageSize?: number;
}) {
  const query = supabase
    .from("ingestion_runs")
    .select("*", { count: "exact" })
    .order("started_at", { ascending: false });
  if (filters?.sourceType) {
    query.eq("source_type", filters.sourceType);
  }
  if (filters?.sourceId !== undefined) {
    if (filters.sourceId === null) {
      query.is("source_id", null);
    } else {
      query.eq("source_id", filters.sourceId);
    }
  }
  if (filters?.feed !== undefined) {
    if (filters.feed === null) {
      query.is("feed", null);
    } else {
      query.eq("feed", filters.feed);
    }
  }
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 25;
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;
  query.range(from, to);
  const result = await query;
  const data = assertNoError(result, "list ingestion runs");
  return { data, total: result.count ?? data.length };
}

export async function getLatestIngestionRun(sourceType: string, sourceId?: string | null, feed?: string | null) {
  const query = supabase
    .from("ingestion_runs")
    .select("*")
    .eq("source_type", sourceType)
    .order("started_at", { ascending: false })
    .limit(1);
  if (sourceId === undefined || sourceId === null) {
    query.is("source_id", null);
  } else {
    query.eq("source_id", sourceId);
  }
  if (feed === undefined || feed === null) {
    query.is("feed", null);
  } else {
    query.eq("feed", feed);
  }
  const result = await query.maybeSingle();
  return result.data;
}

export async function markIngestionRunFailed(id: string, errorSummary: string) {
  const result = await supabase
    .from("ingestion_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_summary: errorSummary,
    })
    .eq("id", id)
    .select("*")
    .single();
  return assertNoError(result, "mark ingestion run failed");
}
