import { convexClient } from "../client";
import { anyApi } from "convex/server";

export async function createSyncRun(sourceId: string) {
  try {
    return await convexClient.mutation(anyApi.sync_runs.create, {
      source_id: sourceId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mutation failed";
    throw new Error(`create sync run: ${message}`);
  }
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
  try {
    const result = await convexClient.mutation(anyApi.sync_runs.complete, {
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
    throw new Error(`complete sync run: ${message}`);
  }
}

export async function listSyncRuns(sourceId?: string) {
  try {
    const result = await convexClient.query(anyApi.sync_runs.list, {
      source_id: sourceId ?? undefined,
      page: 1,
      page_size: 50,
    });
    return result?.data ?? [];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed";
    throw new Error(`list sync runs: ${message}`);
  }
}
