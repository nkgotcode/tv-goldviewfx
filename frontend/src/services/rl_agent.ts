import { getApiBaseUrl, getApiHeaders } from "./api";

export type AgentRun = {
  id: string;
  mode: "paper" | "live";
  pair: string;
  status: "running" | "paused" | "stopped";
  started_at: string;
  stopped_at?: string | null;
  learning_enabled: boolean;
  learning_window_minutes?: number | null;
  agent_version_id: string;
  risk_limit_set_id: string;
};

export type AgentVersion = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  artifact_uri?: string | null;
  promoted_at?: string | null;
};

export type RiskLimitSet = {
  id: string;
  name: string;
  max_position_size: number;
  leverage_cap: number;
  max_daily_loss: number;
  max_drawdown: number;
  max_open_positions: number;
  effective_from?: string;
  active: boolean;
};

export type AgentStatus = {
  id: string;
  currentRun?: AgentRun | null;
  activeVersion?: AgentVersion | null;
  learningEnabled?: boolean;
  killSwitchEnabled?: boolean;
  promotionGateStatus?: "pass" | "fail" | "unknown";
};

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...getApiHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchAgentStatus(agentId = "gold-rl-agent") {
  return fetchJson<AgentStatus>(`/agents/${agentId}`);
}

export async function listAgentRuns(agentId = "gold-rl-agent") {
  return fetchJson<AgentRun[]>(`/agents/${agentId}/runs`);
}

export async function startAgentRun(agentId: string, payload: {
  mode: "paper" | "live";
  pair: string;
  riskLimitSetId: string;
  learningEnabled?: boolean;
  learningWindowMinutes?: number;
  featureSetVersionId?: string;
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

export async function listRiskLimitSets() {
  return fetchJson<RiskLimitSet[]>("/risk-limits");
}

export async function createRiskLimitSet(payload: {
  name: string;
  maxPositionSize: number;
  leverageCap: number;
  maxDailyLoss: number;
  maxDrawdown: number;
  maxOpenPositions: number;
}) {
  return fetchJson<RiskLimitSet>("/risk-limits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateRiskLimitSet(id: string, payload: Partial<{
  name: string;
  maxPositionSize: number;
  leverageCap: number;
  maxDailyLoss: number;
  maxDrawdown: number;
  maxOpenPositions: number;
}>) {
  return fetchJson<RiskLimitSet>(`/risk-limits/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function listAgentVersions(agentId = "gold-rl-agent") {
  return fetchJson<AgentVersion[]>(`/agents/${agentId}/versions`);
}
