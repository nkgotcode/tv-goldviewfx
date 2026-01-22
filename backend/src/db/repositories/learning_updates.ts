import { supabase } from "../client";
import { assertNoError } from "./base";

export type LearningUpdateInsert = {
  agent_version_id: string;
  window_start: string;
  window_end: string;
  status: "running" | "succeeded" | "failed";
  started_at?: string;
  completed_at?: string | null;
  evaluation_report_id?: string | null;
};

export async function insertLearningUpdate(payload: LearningUpdateInsert) {
  const result = await supabase.from("learning_updates").insert(payload).select("*").single();
  return assertNoError(result, "insert learning update");
}

export async function updateLearningUpdate(id: string, payload: Partial<LearningUpdateInsert>) {
  const result = await supabase.from("learning_updates").update(payload).eq("id", id).select("*").single();
  return assertNoError(result, "update learning update");
}

export async function listLearningUpdates(agentVersionId: string) {
  const result = await supabase
    .from("learning_updates")
    .select("*")
    .eq("agent_version_id", agentVersionId)
    .order("started_at", { ascending: false });
  return assertNoError(result, "list learning updates");
}
