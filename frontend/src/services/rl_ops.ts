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
    const body = await response.text();
    let parsed: { message?: string; error?: string } | null = null;
    try {
      parsed = JSON.parse(body) as { message?: string; error?: string };
    } catch {
      parsed = null;
    }
    const message = parsed?.message ?? parsed?.error ?? body;
    throw new Error(message || `API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function fetchJsonWithTimeout<T>(path: string, init: RequestInit = {}, timeoutMs = 4000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeoutMs);

  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        ...getApiHeaders(),
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      let parsed: { message?: string; error?: string } | null = null;
      try {
        parsed = JSON.parse(body) as { message?: string; error?: string };
      } catch {
        parsed = null;
      }
      const message = parsed?.message ?? parsed?.error ?? body;
      throw new Error(message || `API error: ${response.status}`);
    }
    return response.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
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

export type DataGapHealthTotals = {
  open: number;
  healing: number;
  last_detected_at: string | null;
  last_seen_at: string | null;
  oldest_open_at: string | null;
};

export type DataGapHealthByPair = DataGapHealthTotals & {
  pair: string;
};

export type DataGapHealthBySource = DataGapHealthTotals & {
  source_type: string;
};

export type DataGapOpenEvent = {
  id: string;
  pair: string;
  source_type: string;
  interval: string | null;
  gap_start: string;
  gap_end: string;
  expected_interval_seconds: number | null;
  gap_seconds: number;
  missing_points: number | null;
  status: "open" | "healing";
  detected_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  heal_attempts: number;
  last_heal_at: string | null;
};

export type DataGapHealth = {
  generated_at: string;
  totals: DataGapHealthTotals;
  by_pair: DataGapHealthByPair[];
  by_source: DataGapHealthBySource[];
  open_events: DataGapOpenEvent[];
};

export async function fetchDataGapHealth(params?: { pair?: string; sourceType?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.pair) query.set("pair", params.pair);
  if (params?.sourceType) query.set("source_type", params.sourceType);
  if (typeof params?.limit === "number" && Number.isFinite(params.limit) && params.limit > 0) {
    query.set("limit", String(params.limit));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return fetchJsonWithTimeout<DataGapHealth>(`/ops/gaps/health${suffix}`, {}, 3500);
}

export type FetchOnlineLearningStatusOptions = {
  limit?: number;
  includePairReports?: boolean;
  includeHealth?: boolean;
};

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

export type OnlineLearningConfig = {
  enabled: boolean;
  intervalMin: number;
  interval: string;
  contextIntervals: string[];
  pair: string;
  pairs: string[];
  trainWindowMin: number;
  evalWindowMin: number;
  evalLagMin: number;
  windowSize: number;
  stride: number;
  timesteps: number;
  decisionThreshold: number;
  autoRollForward: boolean;
  minWinRate: number;
  minNetPnl: number;
  maxDrawdown: number;
  minTradeCount: number;
  minWinRateDelta: number;
  minNetPnlDelta: number;
  maxDrawdownDelta: number;
  minTradeCountDelta: number;
  minEffectSize: number;
  minConfidenceZ: number;
  minSampleSize: number;
  leverageDefault: number;
  takerFeeBps: number;
  slippageBps: number;
  fundingWeight: number;
  drawdownPenalty: number;
  feedbackRounds: number;
  feedbackTimesteps: number;
  feedbackHardRatio: number;
  rolloutMode?: "shadow" | "canary" | "full";
  canaryMinTradeCount?: number;
  canaryMaxDrawdown?: number;
};

export type RlServiceHealthSnapshot = {
  status: "ok" | "error" | "unavailable";
  checkedAt: string;
  environment?: string;
  strictBacktest?: boolean;
  strictModelInference?: boolean;
  mlDependencies?: Record<string, boolean>;
  error?: string | null;
};

export type OnlineLearningReport = {
  id: string;
  agentVersionId: string;
  pair: string;
  periodStart: string;
  periodEnd: string;
  winRate: number;
  netPnlAfterFees: number;
  maxDrawdown: number;
  tradeCount: number;
  backtestRunId?: string | null;
  status: "pass" | "fail";
  createdAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type OnlineLearningUpdate = {
  id: string;
  pair?: string | null;
  agentVersionId: string;
  windowStart: string;
  windowEnd: string;
  status: string;
  startedAt?: string | null;
  completedAt?: string | null;
  evaluationReportId?: string | null;
  championEvaluationReportId?: string | null;
  promoted?: boolean | null;
  decisionReasons?: string[];
  metricDeltas?: Record<string, number>;
  evaluationReport?: OnlineLearningReport | null;
  championEvaluationReport?: OnlineLearningReport | null;
};

export type OnlineLearningStatus = {
  generatedAt: string;
  config: OnlineLearningConfig;
  rlService: { url: string; mock: boolean; health?: RlServiceHealthSnapshot | null };
  latestUpdates: OnlineLearningUpdate[];
  latestReport?: OnlineLearningReport | null;
  latestReportsByPair?: Array<{ pair: string; report: OnlineLearningReport | null }>;
};

export async function fetchOnlineLearningStatus(
  options: number | FetchOnlineLearningStatusOptions = 5,
): Promise<OnlineLearningStatus | null> {
  const parsedOptions =
    typeof options === "number"
      ? { limit: options }
      : options ?? {};
  const query = new URLSearchParams();
  if (typeof parsedOptions.limit === "number" && Number.isFinite(parsedOptions.limit) && parsedOptions.limit > 0) {
    query.set("limit", String(parsedOptions.limit));
  }
  if (parsedOptions.includePairReports) {
    query.set("include_pair_reports", "true");
  }
  if (parsedOptions.includeHealth) {
    query.set("include_health", "true");
  }
  const querySuffix = query.toString() ? `?${query.toString()}` : "";
  try {
    return await fetchJsonWithTimeout<OnlineLearningStatus>(`/ops/learning/status${querySuffix}`, {}, 3500);
  } catch (err) {
    if (err instanceof Error && err.message.includes("404")) {
      return null;
    }
    throw err;
  }
}

export type OnlineLearningHistoryResponse = {
  generatedAt: string;
  items: OnlineLearningUpdate[];
  filters: {
    search: string;
    status: "running" | "succeeded" | "failed" | null;
    pair: string | null;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  scan: {
    limit: number;
    truncated: boolean;
  };
};

export async function fetchOnlineLearningHistory(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "running" | "succeeded" | "failed" | "";
  pair?: string;
}): Promise<OnlineLearningHistoryResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("page_size", String(params.pageSize));
  if (params?.search) query.set("search", params.search);
  if (params?.status) query.set("status", params.status);
  if (params?.pair) query.set("pair", params.pair);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return fetchJson<OnlineLearningHistoryResponse>(`/ops/learning/history${suffix}`);
}

export async function runOnlineLearningNow() {
  return fetchJson<{ status: string }>(`/ops/learning/run`, {
    method: "POST",
  });
}

export type OnlineLearningRunRequest = {
  pair?: string;
  pairs?: string[];
  useConfiguredPairs?: boolean;
  interval?: string;
  contextIntervals?: string[];
  contextIntervalsCsv?: string;
  trainWindowMin?: number;
  evalWindowMin?: number;
  evalLagMin?: number;
  windowSize?: number;
  stride?: number;
  timesteps?: number;
  decisionThreshold?: number;
  autoRollForward?: boolean;
  promotionGates?: {
    minWinRate?: number;
    minNetPnl?: number;
    maxDrawdown?: number;
    minTradeCount?: number;
    minWinRateDelta?: number;
    minNetPnlDelta?: number;
    maxDrawdownDelta?: number;
    minTradeCountDelta?: number;
    minEffectSize?: number;
    minConfidenceZ?: number;
    minSampleSize?: number;
  };
};

export async function runOnlineLearningWithSettings(payload: OnlineLearningRunRequest) {
  return fetchJson(`/ops/learning/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
