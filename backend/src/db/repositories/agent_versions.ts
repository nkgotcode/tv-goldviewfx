import { supabase } from "../client";
import { assertNoError } from "./base";

export type AgentVersionInsert = {
  name: string;
  training_window_start?: string | null;
  training_window_end?: string | null;
  algorithm_label?: string | null;
  hyperparameter_summary?: string | null;
  artifact_uri?: string | null;
  status?: "draft" | "evaluating" | "promoted" | "retired";
  promoted_at?: string | null;
};

export async function insertAgentVersion(payload: AgentVersionInsert) {
  const result = await supabase.from("agent_versions").insert(payload).select("*").single();
  return assertNoError(result, "insert agent version");
}

export async function updateAgentVersion(id: string, payload: Partial<AgentVersionInsert>) {
  const result = await supabase.from("agent_versions").update(payload).eq("id", id).select("*").single();
  return assertNoError(result, "update agent version");
}

export async function getAgentVersion(id: string) {
  const result = await supabase.from("agent_versions").select("*").eq("id", id).single();
  return assertNoError(result, "get agent version");
}

export async function listAgentVersions(filters: { status?: AgentVersionInsert["status"] } = {}) {
  const query = supabase.from("agent_versions").select("*").order("created_at", { ascending: false });
  if (filters.status) {
    query.eq("status", filters.status);
  }
  const result = await query;
  return assertNoError(result, "list agent versions");
}
