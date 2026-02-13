import { convex } from "../client";
import { assertNoError } from "./base";

export type OpsAlertInsert = {
  category: "slo" | "drift" | "ops";
  severity: "low" | "medium" | "high";
  metric: string;
  value: number;
  threshold?: number | null;
  status?: "open" | "acknowledged" | "resolved";
  triggered_at?: string;
  metadata?: Record<string, unknown>;
};

export async function insertOpsAlert(payload: OpsAlertInsert) {
  const result = await convex
    .from("ops_alerts")
    .insert({
      category: payload.category,
      severity: payload.severity,
      metric: payload.metric,
      value: payload.value,
      threshold: payload.threshold ?? null,
      status: payload.status ?? "open",
      triggered_at: payload.triggered_at ?? new Date().toISOString(),
      metadata: payload.metadata ?? {},
    })
    .select("*")
    .single();
  return assertNoError(result, "insert ops alert");
}

export async function listOpsAlerts(limit = 100) {
  const result = await convex
    .from("ops_alerts")
    .select("*")
    .order("triggered_at", { ascending: false })
    .limit(limit);
  return assertNoError(result, "list ops alerts");
}
