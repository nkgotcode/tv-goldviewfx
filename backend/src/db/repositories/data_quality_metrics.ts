import { supabase } from "../client";
import { assertNoError } from "./base";

export type DataQualityMetricInsert = {
  source_type: string;
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
  coverage_pct: number;
  missing_fields_count: number;
  parse_confidence: number;
  status: "ok" | "degraded" | "failed";
  computed_at?: string;
};

export async function insertDataQualityMetric(payload: DataQualityMetricInsert) {
  const result = await supabase.from("data_quality_metrics").insert(payload).select("*").single();
  return assertNoError(result, "insert data quality metric");
}

export async function listDataQualityMetrics(pair?: DataQualityMetricInsert["pair"]) {
  const query = supabase.from("data_quality_metrics").select("*").order("computed_at", { ascending: false });
  if (pair) {
    query.eq("pair", pair);
  }
  const result = await query;
  return assertNoError(result, "list data quality metrics");
}
