import { supabase } from "../client";
import { assertNoError } from "./base";

export type AgentRunInsert = {
  mode: "paper" | "live";
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
  status: "running" | "paused" | "stopped";
  learning_enabled?: boolean;
  learning_window_minutes?: number | null;
  agent_version_id: string;
  risk_limit_set_id: string;
  dataset_version_id?: string | null;
  feature_set_version_id?: string | null;
  started_at?: string;
  stopped_at?: string | null;
};

export async function insertAgentRun(payload: AgentRunInsert) {
  const result = await supabase.from("agent_runs").insert(payload).select("*").single();
  return assertNoError(result, "insert agent run");
}

export async function updateAgentRun(id: string, payload: Partial<AgentRunInsert>) {
  const result = await supabase.from("agent_runs").update(payload).eq("id", id).select("*").single();
  return assertNoError(result, "update agent run");
}

export async function getAgentRun(id: string) {
  const result = await supabase.from("agent_runs").select("*").eq("id", id).single();
  return assertNoError(result, "get agent run");
}

export async function listAgentRuns(filters: {
  pair?: AgentRunInsert["pair"];
  status?: AgentRunInsert["status"];
  mode?: AgentRunInsert["mode"];
} = {}) {
  const query = supabase.from("agent_runs").select("*").order("started_at", { ascending: false });
  if (filters.pair) {
    query.eq("pair", filters.pair);
  }
  if (filters.status) {
    query.eq("status", filters.status);
  }
  if (filters.mode) {
    query.eq("mode", filters.mode);
  }
  const result = await query;
  return assertNoError(result, "list agent runs");
}
