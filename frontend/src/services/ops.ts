import { getApiBaseUrl, getApiHeaders } from "./api";

async function fetchOpsJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...getApiHeaders(),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export type OpsIngestionStatusItem = {
  source_type: string;
  source_id: string | null;
  feed: string | null;
  enabled: boolean;
  refresh_interval_seconds: number | null;
  backoff_base_seconds: number | null;
  backoff_max_seconds: number | null;
  state: string;
  last_run: Record<string, any> | null;
  last_run_at: string | null;
  next_run_at: string | null;
};

export type OpsIngestionStatusResponse = {
  generated_at: string;
  sources: OpsIngestionStatusItem[];
};

export type IngestionRun = {
  id: string;
  source_type: string;
  source_id: string | null;
  feed: string | null;
  trigger: string;
  status: string;
  started_at: string;
  finished_at?: string | null;
  new_count: number;
  updated_count: number;
  error_count: number;
  error_summary?: string | null;
  coverage_pct?: number | null;
  missing_fields_count?: number | null;
  parse_confidence?: number | null;
};

export type OpsAuditEvent = {
  id: string;
  actor: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
};

export type TradingSummary = {
  generated_at: string;
  trade_count: number;
  filled_count: number;
  win_rate: number;
  net_pnl: number;
  avg_pnl: number;
  max_drawdown: number;
  exposure_by_instrument: Record<string, number>;
};

export type TradingMetrics = {
  generated_at: string;
  series: Array<{ bucket: string; pnl: number; trade_count: number; win_rate: number }>;
};

export type SourceEfficacy = {
  source_type: string;
  source_id: string | null;
  source_name: string;
  item_count: number;
  signal_count: number;
  trade_count: number;
  win_rate: number;
  conversion_to_signal: number;
  conversion_to_trade: number;
};

export type SentimentPnl = {
  generated_at: string;
  correlation: number;
  by_sentiment: Array<{ label: string; avg_pnl: number; trade_count: number }>;
};

export type TopicTrend = {
  id: string;
  period: string;
  window_start: string;
  window_end: string;
  label: string;
  keywords: string[];
  idea_count: number;
};

export type AgentConfig = {
  id: string;
  enabled: boolean;
  mode: "paper" | "live";
  max_position_size: number;
  daily_loss_limit: number;
  allowed_instruments: string[];
  kill_switch?: boolean;
  min_confidence_score?: number;
  allowed_source_ids?: string[];
  promotion_required?: boolean;
  promotion_min_trades?: number;
  promotion_min_win_rate?: number;
  promotion_min_net_pnl?: number;
  promotion_max_drawdown?: number;
};

export async function fetchOpsIngestionStatus() {
  return fetchOpsJson<OpsIngestionStatusResponse>("/ops/ingestion/status");
}

export async function fetchOpsIngestionRuns(params?: { source_type?: string; source_id?: string; feed?: string }) {
  const query = new URLSearchParams();
  if (params?.source_type) query.set("source_type", params.source_type);
  if (params?.source_id) query.set("source_id", params.source_id);
  if (params?.feed) query.set("feed", params.feed);
  const queryString = query.toString();
  return fetchOpsJson<{ data: IngestionRun[]; total: number }>(
    queryString ? `/ops/ingestion/runs?${queryString}` : "/ops/ingestion/runs",
  );
}

export async function updateIngestionConfig(payload: Record<string, any>) {
  return fetchOpsJson<any>("/ops/ingestion/config", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function runIngestionAction(action: string, source: string, payload: Record<string, any>) {
  return fetchOpsJson<any>(`/ops/ingestion/${source}/${action}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchTradingSummary() {
  return fetchOpsJson<TradingSummary>("/ops/trading/summary");
}

export async function fetchTradingMetrics() {
  return fetchOpsJson<TradingMetrics>("/ops/trading/metrics");
}

export async function fetchOpsAudit(limit = 100) {
  return fetchOpsJson<{ data: OpsAuditEvent[] }>(`/ops/audit?limit=${limit}`);
}

export async function fetchSourceEfficacy() {
  return fetchOpsJson<{ generated_at: string; sources: SourceEfficacy[] }>("/ops/insights/source-efficacy");
}

export async function fetchSentimentPnl() {
  return fetchOpsJson<SentimentPnl>("/ops/insights/sentiment-pnl");
}

export async function fetchTopicTrends(period?: string) {
  const query = period ? `?period=${encodeURIComponent(period)}` : "";
  return fetchOpsJson<{ generated_at: string; trends: TopicTrend[] }>(`/ops/insights/topic-trends${query}`);
}

export async function fetchAgentConfig() {
  return fetchOpsJson<AgentConfig>("/agent/config");
}

export async function updateAgentConfig(payload: Partial<AgentConfig>) {
  return fetchOpsJson<AgentConfig>("/agent/config", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export type SourcePolicy = {
  id: string;
  source_id: string | null;
  source_type: string;
  enabled: boolean;
  min_confidence_score: number | null;
  notes: string | null;
};

export async function fetchSourcePolicies() {
  return fetchOpsJson<{ data: SourcePolicy[] }>("/source-policies");
}

export async function updateSourcePolicy(payload: Partial<SourcePolicy> & { source_type: string }) {
  return fetchOpsJson<SourcePolicy>("/source-policies", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
