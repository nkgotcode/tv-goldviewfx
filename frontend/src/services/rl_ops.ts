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
  metadata?: {
    foldMetrics?: Array<{
      fold: number;
      start: string;
      end: string;
      winRate: number;
      netPnlAfterFees: number;
      maxDrawdown: number;
      tradeCount: number;
      status: "pass" | "fail";
    }>;
    aggregate?: {
      folds: number;
      passRate: number;
      winRateAvg: number;
      netPnlAfterFeesTotal: number;
      maxDrawdownWorst: number;
      tradeCountTotal: number;
    } | null;
    featureSchemaFingerprint?: string | null;
    promotionComparison?: Record<string, unknown> | null;
  } | null;
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
  rlService: { url: string; mock: boolean };
  latestUpdates: OnlineLearningUpdate[];
  latestReport?: OnlineLearningReport | null;
  latestReportsByPair?: Array<{ pair: string; report: OnlineLearningReport | null }>;
};

export async function fetchOnlineLearningStatus(limit = 5): Promise<OnlineLearningStatus | null> {
  const query = limit ? `?limit=${limit}` : "";
  try {
    return await fetchJson<OnlineLearningStatus>(`/ops/learning/status${query}`);
  } catch (err) {
    if (err instanceof Error && err.message.includes("404")) {
      return null;
    }
    throw err;
  }
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
