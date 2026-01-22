import { getApiBaseUrl, getApiHeaders } from "./api";

export type DatasetVersion = {
  id: string;
  pair: string;
  interval: string;
  start_at: string;
  end_at: string;
  checksum: string;
  feature_set_version_id?: string | null;
  created_at: string;
};

export type DatasetLineage = {
  id: string;
  dataset_id: string;
  source_run_ids: string[];
  parent_dataset_ids: string[];
  created_at: string;
};

export type FeatureSetVersion = {
  id: string;
  label: string;
  description?: string | null;
  created_at: string;
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

export async function listDatasetVersions() {
  return fetchJson<DatasetVersion[]>("/datasets");
}

export async function getDatasetLineage(datasetId: string) {
  return fetchJson<DatasetLineage>(`/datasets/${datasetId}/lineage`);
}

export async function listFeatureSetVersions() {
  return fetchJson<FeatureSetVersion[]>("/feature-sets");
}

export async function createFeatureSetVersion(payload: { includeNews?: boolean; includeOcr?: boolean }) {
  return fetchJson<FeatureSetVersion>("/feature-sets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
