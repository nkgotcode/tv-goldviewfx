import { getApiBaseUrl, getApiHeaders } from "./api";
import type { AgentRun, AgentStatus, RiskLimitSet } from "./rl_agent";
import type { IngestionStatus } from "./ingestion";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...getApiHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchOpsIngestionStatus() {
  return fetchJson<IngestionStatus>("/ingestion/status");
}

export async function fetchBingxMarketStatus(pair?: string) {
  const query = pair ? `?pair=${encodeURIComponent(pair)}` : "";
  return fetchJson(`/bingx/market-data/status${query}`);
}

export async function triggerTradingViewSync(payload: {
  source_id?: string;
  full_content?: boolean;
  include_updates?: boolean;
}) {
  return fetchJson("/ingestion/tradingview/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function triggerTelegramIngest(payload: { source_id: string }) {
  return fetchJson("/ingestion/telegram/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function triggerBingxBackfill(payload: {
  pairs?: string[];
  intervals?: string[];
  maxBatches?: number;
}) {
  return fetchJson("/bingx/market-data/backfill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function triggerBingxRefresh(payload: {
  pairs?: string[];
  intervals?: string[];
  maxBatches?: number;
}) {
  return fetchJson("/bingx/market-data/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function fetchAgentStatus(agentId = "gold-rl-agent") {
  return fetchJson<AgentStatus>(`/agents/${agentId}`);
}

export async function listRiskLimitSets() {
  return fetchJson<RiskLimitSet[]>("/risk-limits");
}

export async function startAgentRun(agentId: string, payload: {
  mode: "paper" | "live";
  pair: string;
  riskLimitSetId: string;
  learningEnabled?: boolean;
  learningWindowMinutes?: number;
}) {
  return fetchJson<AgentRun>(`/agents/${agentId}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function pauseAgentRun(agentId = "gold-rl-agent") {
  return fetchJson<AgentRun>(`/agents/${agentId}/pause`, { method: "POST" });
}

export async function resumeAgentRun(agentId = "gold-rl-agent") {
  return fetchJson<AgentRun>(`/agents/${agentId}/resume`, { method: "POST" });
}

export async function stopAgentRun(agentId = "gold-rl-agent") {
  return fetchJson<AgentRun>(`/agents/${agentId}/stop`, { method: "POST" });
}
