import { supabase } from "../client";
import { assertNoError } from "./base";

export type DriftAlertInsert = {
  agent_id: string;
  detected_at?: string;
  metric: string;
  baseline_value?: number | null;
  current_value?: number | null;
  status?: "open" | "acknowledged" | "resolved";
  action_taken?: string | null;
};

export async function insertDriftAlert(payload: DriftAlertInsert) {
  const result = await supabase
    .from("drift_alerts")
    .insert({
      agent_id: payload.agent_id,
      detected_at: payload.detected_at ?? new Date().toISOString(),
      metric: payload.metric,
      baseline_value: payload.baseline_value ?? null,
      current_value: payload.current_value ?? null,
      status: payload.status ?? "open",
      action_taken: payload.action_taken ?? null,
    })
    .select("*")
    .single();

  return assertNoError(result, "insert drift alert");
}

export async function listDriftAlerts(agentId?: string) {
  const query = supabase.from("drift_alerts").select("*").order("detected_at", { ascending: false });
  if (agentId) {
    query.eq("agent_id", agentId);
  }
  const result = await query;
  return assertNoError(result, "list drift alerts");
}

export async function updateDriftAlert(id: string, payload: Partial<DriftAlertInsert>) {
  const result = await supabase
    .from("drift_alerts")
    .update({
      detected_at: payload.detected_at,
      metric: payload.metric,
      baseline_value: payload.baseline_value,
      current_value: payload.current_value,
      status: payload.status,
      action_taken: payload.action_taken,
    })
    .eq("id", id)
    .select("*")
    .single();

  return assertNoError(result, "update drift alert");
}
