const defaultBaseUrl = "/api/backend";

export type DashboardSummary = {
  idea_count: number;
  signal_count: number;
  trade_count: number;
  last_sync_status: string | null;
  last_sync_at: string | null;
};

export type Idea = {
  id: string;
  source_id?: string;
  title: string;
  url: string;
  external_id?: string | null;
  author_handle?: string | null;
  published_at: string | null;
  ingested_at?: string;
  updated_at?: string;
  status?: string;
  dedup_status?: string;
  duplicate_of_id?: string | null;
  content_hash?: string;
  content?: string | null;
  review_status?: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  enrichments?: Array<{ sentiment_label: string; sentiment_score: number }>;
};

export type TelegramPost = {
  id: string;
  external_id: string;
  content: string;
  published_at: string | null;
  dedup_status: string;
  status: string;
};

export type Signal = {
  id: string;
  source_type: string;
  idea_id: string | null;
  telegram_post_id: string | null;
  news_item_id?: string | null;
  payload_summary: string | null;
  confidence_score: number;
  generated_at: string;
};

export type Trade = {
  id: string;
  instrument: string;
  side: string;
  quantity: number;
  status: string;
  mode: string;
  client_order_id?: string | null;
  avg_fill_price: number | null;
  position_size: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  tp_price: number | null;
  sl_price: number | null;
  liquidation_price: number | null;
  leverage: number | null;
  margin_type: string | null;
  created_at: string;
};

export function getApiBaseUrl() {
  return defaultBaseUrl;
}

export function getApiHeaders() {
  return {};
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    cache: "no-store",
    headers: getApiHeaders(),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchDashboardSummary() {
  return fetchJson<DashboardSummary>("/dashboard/summary");
}

export async function fetchIdeas() {
  return fetchJson<Idea[]>("/ideas");
}

export async function fetchSignals() {
  return fetchJson<Signal[]>("/signals");
}

export async function fetchTelegramPosts() {
  return fetchJson<TelegramPost[]>("/telegram/posts");
}

export async function fetchTrades() {
  return fetchJson<Trade[]>("/trades");
}

export async function fetchTradeDetail(id: string) {
  return fetchJson<
    Trade & {
      executions: Array<{
        exchange_order_id: string | null;
        status: string;
        filled_quantity: number;
        average_price: number;
        executed_at: string;
      }>;
    }
  >(`/trades/${id}`);
}

export type HealthStatus = { status: string };

export async function fetchHealth() {
  return fetchJson<HealthStatus>("/health");
}

export type OpsIngestionStatus = {
  generated_at: string;
  sources?: Array<{ source_type?: string; source_id?: string; status?: string; last_run?: string }>;
};

export async function fetchOpsIngestionStatus() {
  return fetchJson<OpsIngestionStatus>("/ops/ingestion/status");
}

export type OpsLearningHistoryResponse = {
  generatedAt: string;
  items: Array<{
    id: string;
    status?: string;
    pair?: string | null;
    evaluationReport?: { status?: string; backtestRunId?: string } | null;
  }>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export async function fetchOpsLearningHistory(params?: { page?: number; page_size?: number }) {
  const search = new URLSearchParams();
  if (params?.page != null) search.set("page", String(params.page));
  if (params?.page_size != null) search.set("page_size", String(params.page_size));
  const q = search.toString();
  return fetchJson<OpsLearningHistoryResponse>(`/ops/learning/history${q ? `?${q}` : ""}`);
}
