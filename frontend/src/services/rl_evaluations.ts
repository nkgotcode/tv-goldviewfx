import { getApiBaseUrl, getApiHeaders } from "./api";

export type EvaluationReport = {
  id: string;
  agent_version_id: string;
  pair: string;
  period_start: string;
  period_end: string;
  win_rate: number;
  net_pnl_after_fees: number;
  max_drawdown: number;
  trade_count: number;
  exposure_by_pair: Record<string, number>;
  status: "pass" | "fail";
  created_at: string;
  dataset_version_id?: string | null;
  feature_set_version_id?: string | null;
};

export type EvaluationRequest = {
  pair: string;
  periodStart: string;
  periodEnd: string;
  agentVersionId?: string;
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

export async function listEvaluationReports(agentId = "gold-rl-agent", agentVersionId?: string) {
  const query = agentVersionId ? `?agentVersionId=${encodeURIComponent(agentVersionId)}` : "";
  return fetchJson<EvaluationReport[]>(`/agents/${agentId}/evaluations${query}`);
}

export async function runEvaluation(agentId: string, payload: EvaluationRequest) {
  return fetchJson<EvaluationReport>(`/agents/${agentId}/evaluations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
