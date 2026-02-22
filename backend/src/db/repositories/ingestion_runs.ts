import { convexClient } from "../client";
import { anyApi } from "convex/server";

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

export type StartIngestionRunIfIdleResult = {
  created: boolean;
  reason: string;
  run: {
    id: string;
    source_type: string;
    source_id: string | null;
    feed: string | null;
    trigger: string;
    status: string;
    started_at: string;
    finished_at: string | null;
  } | null;
  timed_out_run_id: string | null;
};

function normalizeRunRecord(value: unknown): StartIngestionRunIfIdleResult["run"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string") {
    return null;
  }
  return {
    id: row.id,
    source_type: typeof row.source_type === "string" ? row.source_type : "",
    source_id: typeof row.source_id === "string" ? row.source_id : null,
    feed: typeof row.feed === "string" ? row.feed : null,
    trigger: typeof row.trigger === "string" ? row.trigger : "",
    status: typeof row.status === "string" ? row.status : "",
    started_at: typeof row.started_at === "string" ? row.started_at : "",
    finished_at: typeof row.finished_at === "string" ? row.finished_at : null,
  };
}

export async function createIngestionRun(payload: IngestionRunInsert) {
  try {
    return await convexClient.mutation(anyApi.ingestion_runs.create, {
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mutation failed";
    throw new Error(`create ingestion run: ${message}`);
  }
}

export async function startIngestionRunIfIdle(payload: {
  sourceType: string;
  sourceId?: string | null;
  feed?: string | null;
  trigger: string;
  timeoutMinutes?: number;
  startedAt?: string;
}): Promise<StartIngestionRunIfIdleResult> {
  try {
    const result = await convexClient.mutation(anyApi.ingestion_runs.startIfIdle, {
      source_type: payload.sourceType,
      source_id: payload.sourceId ?? null,
      feed: payload.feed ?? null,
      trigger: payload.trigger,
      timeout_minutes: payload.timeoutMinutes ?? 0,
      started_at: payload.startedAt,
    });
    if (!result) {
      throw new Error("missing data");
    }
    const record = result as Record<string, unknown>;
    return {
      created: Boolean(record.created),
      reason: String(record.reason ?? "unknown"),
      run: normalizeRunRecord(record.run),
      timed_out_run_id: typeof record.timed_out_run_id === "string" ? record.timed_out_run_id : null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mutation failed";
    throw new Error(`start ingestion run if idle: ${message}`);
  }
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
  try {
    const result = await convexClient.mutation(anyApi.ingestion_runs.complete, {
      id,
      status: payload.status,
      new_count: payload.newCount,
      updated_count: payload.updatedCount,
      error_count: payload.errorCount,
      error_summary: payload.errorSummary ?? null,
      coverage_pct: payload.coveragePct ?? null,
      missing_fields_count: payload.missingFieldsCount ?? null,
      parse_confidence: payload.parseConfidence ?? null,
    });
    if (!result) {
      throw new Error("missing data");
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mutation failed";
    throw new Error(`complete ingestion run: ${message}`);
  }
}

export async function listIngestionRuns(filters?: {
  sourceType?: string;
  sourceId?: string | null;
  feed?: string | null;
  page?: number;
  pageSize?: number;
}) {
  try {
    const result = await convexClient.query(anyApi.ingestion_runs.list, {
      source_type: filters?.sourceType,
      source_id: filters?.sourceId ?? undefined,
      feed: filters?.feed ?? undefined,
      page: filters?.page,
      page_size: filters?.pageSize,
    });
    const data = result?.data ?? [];
    return { data, total: result?.count ?? data.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`list ingestion runs: ${message}`);
  }
}

export async function getLatestIngestionRun(sourceType: string, sourceId?: string | null, feed?: string | null) {
  try {
    return await convexClient.query(anyApi.ingestion_runs.latest, {
      source_type: sourceType,
      source_id: sourceId ?? null,
      feed: feed ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`get latest ingestion run: ${message}`);
  }
}

export async function markIngestionRunFailed(id: string, errorSummary: string) {
  return completeIngestionRun(id, {
    status: "failed",
    newCount: 0,
    updatedCount: 0,
    errorCount: 1,
    errorSummary,
  });
}
