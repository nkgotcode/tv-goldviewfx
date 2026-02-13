import { convex } from "../client";
import { assertNoError } from "./base";

export type ObservabilityMetricInsert = {
  name: string;
  value: number;
  unit?: string | null;
  tags?: Record<string, string>;
  recorded_at?: string;
  metadata?: Record<string, unknown>;
};

export async function insertObservabilityMetric(payload: ObservabilityMetricInsert) {
  const result = await convex
    .from("observability_metrics")
    .insert({
      name: payload.name,
      value: payload.value,
      unit: payload.unit ?? null,
      tags: payload.tags ?? {},
      recorded_at: payload.recorded_at ?? new Date().toISOString(),
      metadata: payload.metadata ?? {},
    })
    .select("*")
    .single();
  return assertNoError(result, "insert observability metric");
}

export async function listObservabilityMetrics(name?: string, limit = 100) {
  const query = convex.from("observability_metrics").select("*").order("recorded_at", { ascending: false });
  if (name) {
    query.eq("name", name);
  }
  if (limit) {
    query.limit(limit);
  }
  const result = await query;
  return assertNoError(result, "list observability metrics");
}
