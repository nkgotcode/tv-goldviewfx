import type { APIRequestContext } from "@playwright/test";
import { readListResponse } from "./api_list";

export async function runEvaluation(api: APIRequestContext, payload: Record<string, unknown>) {
  const response = await api.post("/agents/gold-rl-agent/evaluations", { data: payload });
  if (!response.ok()) {
    throw new Error(`Failed to run evaluation: ${response.status()}`);
  }
  return response.json();
}

export async function listEvaluations(api: APIRequestContext, agentVersionId?: string) {
  const query = agentVersionId ? `?agentVersionId=${encodeURIComponent(agentVersionId)}` : "";
  const response = await api.get(`/agents/gold-rl-agent/evaluations${query}`);
  if (!response.ok()) {
    throw new Error(`Failed to list evaluations: ${response.status()}`);
  }
  return readListResponse(await response.json());
}
