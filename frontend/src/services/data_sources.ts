import { getApiBaseUrl, getApiHeaders } from "./api";

export type DataSourceStatus = {
  pair: string;
  source_type: string;
  enabled: boolean;
  status: "ok" | "stale" | "unavailable";
  last_seen_at?: string | null;
  freshness_threshold_seconds: number;
  updated_at?: string | null;
};

export type DataSourceRun = {
  id: string;
  sourceType: string;
  pair: string;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  newCount: number;
  updatedCount: number;
  errorCount: number;
  errorSummary?: string | null;
};

export type DataSourceConfigPayload = {
  sources: Array<{
    sourceType: string;
    enabled: boolean;
    freshnessThresholdSeconds?: number;
  }>;
};

export type DataSourceBackfillRequest = {
  sourceType: string;
  pair: string;
  start: string;
  end: string;
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

export async function fetchDataSourceStatus(pair?: string) {
  const query = pair ? `?pair=${encodeURIComponent(pair)}` : "";
  return fetchJson<DataSourceStatus[]>(`/data-sources/status${query}`);
}

export async function updateDataSourceConfig(payload: DataSourceConfigPayload) {
  return fetchJson<{ sources: DataSourceConfigPayload["sources"] }>("/data-sources/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function fetchDataSourceRuns(params?: { sourceType?: string; pair?: string }) {
  const query = new URLSearchParams();
  if (params?.sourceType) query.set("sourceType", params.sourceType);
  if (params?.pair) query.set("pair", params.pair);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return fetchJson<DataSourceRun[]>(`/data-sources/runs${suffix}`);
}

export async function triggerDataSourceBackfill(payload: DataSourceBackfillRequest) {
  return fetchJson<{ status: string }>("/data-sources/backfill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
