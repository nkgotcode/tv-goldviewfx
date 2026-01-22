import { getApiBaseUrl, getApiHeaders } from "./api";

export type SyncRun = {
  id: string;
  source_id: string;
  started_at: string;
  finished_at?: string | null;
  status: string;
  new_count: number;
  updated_count: number;
  error_count: number;
  error_summary?: string | null;
};

export type IngestionSource = {
  id: string;
  identifier: string;
  display_name?: string | null;
  status: string;
  state: "ok" | "running" | "failed" | "unavailable";
  last_run: SyncRun | null;
  last_run_at: string | null;
};

export type BingxFeedStatus = {
  source_type: string;
  status: "ok" | "stale" | "unavailable";
  last_seen_at: string | null;
  freshness_threshold_seconds: number | null;
  updated_at: string | null;
};

export type BingxPairStatus = {
  pair: string;
  overall_status: "ok" | "stale" | "unavailable";
  last_updated_at: string | null;
  feeds: BingxFeedStatus[];
};

export type IngestionStatus = {
  generated_at: string;
  tradingview: {
    overall_status: "ok" | "running" | "failed" | "unavailable";
    last_run: SyncRun | null;
    sources: IngestionSource[];
  };
  telegram: {
    overall_status: "ok" | "running" | "failed" | "unavailable";
    last_run: SyncRun | null;
    sources: IngestionSource[];
  };
  bingx: {
    overall_status: "ok" | "stale" | "unavailable";
    last_updated_at: string | null;
    pairs: BingxPairStatus[];
  };
};

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...getApiHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchIngestionStatus() {
  return fetchJson<IngestionStatus>("/ingestion/status");
}

export async function triggerTradingViewSync(payload: {
  source_id?: string;
  full_content?: boolean;
  include_updates?: boolean;
}) {
  return fetchJson("/ingestion/tradingview/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function triggerTelegramIngest(payload: { source_id: string }) {
  return fetchJson("/ingestion/telegram/ingest", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function triggerBingxBackfill(payload: {
  pairs?: string[];
  intervals?: string[];
  max_batches?: number;
}) {
  return fetchJson("/ingestion/bingx/backfill", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function triggerBingxRefresh(payload: {
  pairs?: string[];
  intervals?: string[];
  max_batches?: number;
}) {
  return fetchJson("/ingestion/bingx/refresh", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
