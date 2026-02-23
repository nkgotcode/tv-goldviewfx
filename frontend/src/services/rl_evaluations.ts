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
  dataset_hash?: string | null;
  artifact_uri?: string | null;
  backtest_run_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type EvaluationRequest = {
  pair: string;
  periodStart: string;
  periodEnd: string;
  interval?: string;
  contextIntervals?: string[];
  agentVersionId?: string;
  datasetVersionId?: string;
  featureSetVersionId?: string;
  decisionThreshold?: number;
  windowSize?: number;
  stride?: number;
  leverage?: number;
  takerFeeBps?: number;
  slippageBps?: number;
  fundingWeight?: number;
  drawdownPenalty?: number;
  fullHistory?: boolean;
  maxFeatureRows?: number;
  strategyIds?: string[];
  venueIds?: string[];
  walkForward?: {
    folds: number;
    purgeBars?: number;
    embargoBars?: number;
    minTrainBars?: number;
    strict?: boolean;
  } | null;
  featureSchemaFingerprint?: string;
};

export type EvaluationConfirmHealRequest = {
  evaluation: EvaluationRequest;
  heal: {
    confirm: true;
    intervals?: string[];
    maxBatches?: number;
    runGapMonitor?: boolean;
  };
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly payload?: Record<string, unknown> | null;

  constructor(message: string, status: number, code?: string, payload?: Record<string, unknown> | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...getApiHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      const json = JSON.parse(body) as unknown;
      parsed = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
    } catch {
      parsed = null;
    }
    const message = (parsed?.message as string) ?? (parsed?.error as string) ?? (parsed?.detail as string) ?? body;
    const code = typeof parsed?.code === "string" ? parsed.code : undefined;
    throw new ApiError(message || `API error: ${response.status}`, response.status, code, parsed);
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

export async function runEvaluationConfirmHeal(agentId: string, payload: EvaluationConfirmHealRequest) {
  return fetchJson<{ report: EvaluationReport; heal: Record<string, unknown> }>(
    `/agents/${agentId}/evaluations/confirm-heal`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}
