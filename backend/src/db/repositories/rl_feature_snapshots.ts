import { randomUUID } from "node:crypto";
import { convex } from "../client";
import {
  listTimescaleFeatureSnapshots,
  marketDataUsesTimescale,
  upsertTimescaleFeatureSnapshots,
  type RlFeatureSnapshotRow,
} from "../timescale/market_data";
import { assertNoError } from "./base";

export type RlFeatureSnapshotInsert = {
  pair: string;
  interval: string;
  feature_set_version_id: string;
  captured_at: string;
  schema_fingerprint: string;
  features: Record<string, number>;
  warmup?: boolean;
  is_complete?: boolean;
  source_window_start?: string | null;
  source_window_end?: string | null;
};

function normalizeRow<T extends RlFeatureSnapshotInsert>(row: T): RlFeatureSnapshotRow {
  return {
    pair: row.pair,
    interval: row.interval,
    feature_set_version_id: row.feature_set_version_id,
    captured_at: row.captured_at,
    schema_fingerprint: row.schema_fingerprint,
    features: row.features ?? {},
    warmup: Boolean(row.warmup),
    is_complete: row.is_complete ?? true,
    source_window_start: row.source_window_start ?? null,
    source_window_end: row.source_window_end ?? null,
  };
}

export async function upsertRlFeatureSnapshots(rows: RlFeatureSnapshotInsert[]) {
  if (rows.length === 0) return [];
  if (marketDataUsesTimescale()) {
    return upsertTimescaleFeatureSnapshots(rows.map((row) => normalizeRow(row)));
  }

  const upserted: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const result = await convex
      .from("rl_feature_snapshots")
      .upsert(
        {
          id: randomUUID(),
          pair: row.pair,
          interval: row.interval,
          feature_set_version_id: row.feature_set_version_id,
          captured_at: row.captured_at,
          schema_fingerprint: row.schema_fingerprint,
          features: row.features,
          warmup: row.warmup ?? false,
          is_complete: row.is_complete ?? true,
          source_window_start: row.source_window_start ?? null,
          source_window_end: row.source_window_end ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "pair,interval,feature_set_version_id,captured_at" },
      )
      .select("*")
      .single();
    upserted.push(assertNoError(result, "upsert rl_feature_snapshots"));
  }
  return upserted;
}

export async function listRlFeatureSnapshots(filters: {
  pair: string;
  interval: string;
  featureSetVersionId: string;
  start?: string;
  end?: string;
  limit?: number;
}) {
  if (marketDataUsesTimescale()) {
    return listTimescaleFeatureSnapshots({
      pair: filters.pair,
      interval: filters.interval,
      featureSetVersionId: filters.featureSetVersionId,
      start: filters.start,
      end: filters.end,
      limit: filters.limit,
    });
  }

  const query = convex
    .from("rl_feature_snapshots")
    .select("*")
    .eq("pair", filters.pair)
    .eq("interval", filters.interval)
    .eq("feature_set_version_id", filters.featureSetVersionId)
    .order("captured_at", { ascending: true });
  if (filters.start) {
    query.gte("captured_at", filters.start);
  }
  if (filters.end) {
    query.lte("captured_at", filters.end);
  }
  if (filters.limit && filters.limit > 0) {
    query.limit(filters.limit);
  }
  const result = await query;
  return assertNoError(result, "list rl_feature_snapshots");
}
