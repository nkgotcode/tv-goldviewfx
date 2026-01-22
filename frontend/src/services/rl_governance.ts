import { getApiBaseUrl, getApiHeaders } from "./api";

export type KillSwitchState = {
  enabled: boolean;
  reason?: string | null;
};

export type PromotionGateConfig = {
  promotion_required?: boolean;
  promotion_min_trades?: number;
  promotion_min_win_rate?: number;
  promotion_min_net_pnl?: number;
  promotion_max_drawdown?: number;
};

export type SourcePolicy = {
  id?: string;
  source_id?: string | null;
  source_type: string;
  enabled?: boolean;
  min_confidence_score?: number | null;
  notes?: string | null;
  updated_at?: string | null;
};

export type DriftAlert = {
  id: string;
  agent_id: string;
  detected_at: string;
  metric: string;
  baseline_value?: number | null;
  current_value?: number | null;
  status: "open" | "acknowledged" | "resolved";
  action_taken?: string | null;
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
    const message = await response.text();
    throw new Error(message || `API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchKillSwitch(agentId = "gold-rl-agent") {
  return fetchJson<KillSwitchState>(`/agents/${agentId}/kill-switch`);
}

export async function updateKillSwitch(agentId: string, payload: KillSwitchState) {
  return fetchJson<KillSwitchState>(`/agents/${agentId}/kill-switch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function fetchPromotionGates(agentId = "gold-rl-agent") {
  return fetchJson<PromotionGateConfig>(`/agents/${agentId}/promotion-gates`);
}

export async function updatePromotionGates(agentId: string, payload: PromotionGateConfig) {
  return fetchJson<PromotionGateConfig>(`/agents/${agentId}/promotion-gates`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function listSourcePolicies(agentId = "gold-rl-agent") {
  return fetchJson<SourcePolicy[]>(`/agents/${agentId}/source-policies`);
}

export async function updateSourcePolicies(agentId: string, policies: SourcePolicy[]) {
  return fetchJson<SourcePolicy[]>(`/agents/${agentId}/source-policies`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(policies),
  });
}

export async function listDriftAlerts(agentId = "gold-rl-agent") {
  return fetchJson<DriftAlert[]>(`/agents/${agentId}/drift-alerts`);
}
