import type { APIRequestContext } from "@playwright/test";
import { parseListResponse } from "./api_list";
import { riskLimitSchema } from "./schemas";

export async function fetchRiskLimitSets(api: APIRequestContext) {
  const response = await api.get("/risk-limits");
  if (!response.ok()) {
    throw new Error(`Failed to fetch risk limits: ${response.status()}`);
  }
  return parseListResponse(riskLimitSchema, await response.json());
}

export async function startAgentRun(api: APIRequestContext, payload: Record<string, unknown>) {
  const response = await api.post("/agents/gold-rl-agent/start", { data: payload });
  if (!response.ok()) {
    throw new Error(`Failed to start run: ${response.status()}`);
  }
  return response.json();
}

export async function pauseAgentRun(api: APIRequestContext) {
  return api.post("/agents/gold-rl-agent/pause");
}

export async function resumeAgentRun(api: APIRequestContext) {
  return api.post("/agents/gold-rl-agent/resume");
}

export async function stopAgentRun(api: APIRequestContext) {
  return api.post("/agents/gold-rl-agent/stop");
}

export async function triggerDecision(api: APIRequestContext, runId: string, payload: Record<string, unknown>) {
  const response = await api.post(`/agents/gold-rl-agent/runs/${runId}/decisions`, { data: payload });
  if (!response.ok()) {
    throw new Error(`Decision failed: ${response.status()}`);
  }
  return response.json();
}

export async function triggerLearningUpdate(api: APIRequestContext, payload: Record<string, unknown>) {
  const response = await api.post("/agents/gold-rl-agent/learning-updates", { data: payload });
  if (!response.ok()) {
    throw new Error(`Learning update failed: ${response.status()}`);
  }
  return response.json();
}

export function buildMarketCandles(count = 6) {
  const now = Date.now();
  return Array.from({ length: count }).map((_, idx) => ({
    timestamp: new Date(now - (count - idx) * 60000).toISOString(),
    open: 2300 + idx,
    high: 2302 + idx,
    low: 2298 + idx,
    close: 2301 + idx,
    volume: 100 + idx,
  }));
}
