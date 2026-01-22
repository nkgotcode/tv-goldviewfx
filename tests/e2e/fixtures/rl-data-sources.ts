import type { APIRequestContext } from "@playwright/test";
import { readListResponse } from "./api_list";

export async function fetchDataSourceStatus(api: APIRequestContext, pair?: string) {
  const query = pair ? `?pair=${encodeURIComponent(pair)}` : "";
  const response = await api.get(`/data-sources/status${query}`);
  if (!response.ok()) {
    throw new Error(`Failed to fetch data source status: ${response.status()}`);
  }
  return readListResponse(await response.json());
}

export async function updateDataSourceConfig(api: APIRequestContext, payload: Record<string, unknown>) {
  const response = await api.patch("/data-sources/config", { data: payload });
  if (!response.ok()) {
    throw new Error(`Failed to update data source config: ${response.status()}`);
  }
  return response.json();
}

export async function fetchDataSourceRuns(api: APIRequestContext, params?: { sourceType?: string; pair?: string }) {
  const query = new URLSearchParams();
  if (params?.sourceType) query.set("sourceType", params.sourceType);
  if (params?.pair) query.set("pair", params.pair);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await api.get(`/data-sources/runs${suffix}`);
  if (!response.ok()) {
    throw new Error(`Failed to fetch data source runs: ${response.status()}`);
  }
  return readListResponse(await response.json());
}

export async function triggerDataSourceBackfill(api: APIRequestContext, payload: Record<string, unknown>) {
  const response = await api.post("/data-sources/backfill", { data: payload });
  if (!response.ok()) {
    throw new Error(`Failed to trigger backfill: ${response.status()}`);
  }
  return response.json();
}
