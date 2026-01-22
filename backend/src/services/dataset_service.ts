import { createHash, randomUUID } from "node:crypto";
import { insertDatasetVersion } from "../db/repositories/dataset_versions";
import { insertDatasetLineage } from "../db/repositories/dataset_lineage";
import { listFeatureSetVersions } from "../db/repositories/feature_set_versions";
import { listIngestionRuns } from "../db/repositories/ingestion_runs";
import { loadRlServiceConfig } from "../config/rl_service";
import { rlServiceClient } from "../rl/client";
import type { DatasetPreviewRequest, DatasetPreviewResponse } from "../types/rl";
import type { TradingPair } from "../types/rl";
import { resolveFeatureSetVersion } from "./feature_set_service";

type DatasetPreviewVersion = {
  id: string;
  pair: TradingPair;
  interval: string;
  start_at: string;
  end_at: string;
  checksum: string;
  feature_set_version_id?: string | null;
};

function buildMockPreview(input: DatasetPreviewRequest, featureSetVersionId?: string | null): DatasetPreviewResponse {
  const payload = {
    pair: input.pair,
    interval: input.interval,
    start_at: input.startAt,
    end_at: input.endAt,
    feature_set_version_id: featureSetVersionId ?? null,
    window_size: input.windowSize ?? 30,
    stride: input.stride ?? 1,
  };
  const checksum = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return {
    version: {
      id: randomUUID(),
      pair: input.pair,
      interval: input.interval,
      startAt: input.startAt,
      endAt: input.endAt,
      checksum,
      featureSetVersionId: featureSetVersionId ?? null,
      createdAt: new Date().toISOString(),
    },
    windowCount: Math.max(0, Math.floor((new Date(input.endAt).getTime() - new Date(input.startAt).getTime()) / 60000)),
  };
}

function normalizePreviewVersion(payload: DatasetPreviewResponse["version"] & Record<string, unknown>): DatasetPreviewVersion {
  return {
    id: String(payload.id ?? payload.datasetId ?? randomUUID()),
    pair: payload.pair as TradingPair,
    interval: String(payload.interval ?? "1m"),
    start_at: String(payload.start_at ?? payload.startAt),
    end_at: String(payload.end_at ?? payload.endAt),
    checksum: String(payload.checksum),
    feature_set_version_id: (payload.feature_set_version_id ?? payload.featureSetVersionId ?? null) as string | null,
  };
}

async function ensureFeatureSetVersion() {
  const existing = await listFeatureSetVersions();
  if (existing.length > 0) {
    return existing[0];
  }
  return resolveFeatureSetVersion({ includeNews: true, includeOcr: false });
}

async function latestSourceRunIds() {
  const ids: string[] = [];
  for (const sourceType of ["tradingview", "telegram"]) {
    const { data } = await listIngestionRuns({ sourceType, page: 1, pageSize: 1 });
    if (data[0]?.id) {
      ids.push(data[0].id);
    }
  }
  return ids;
}

export async function createDatasetVersion(input: {
  pair: TradingPair;
  interval: string;
  startAt: string;
  endAt: string;
  featureSetVersionId?: string | null;
}) {
  const featureSet = input.featureSetVersionId ?? (await ensureFeatureSetVersion()).id;
  const config = loadRlServiceConfig();
  const previewRequest: DatasetPreviewRequest = {
    pair: input.pair,
    interval: input.interval,
    startAt: input.startAt,
    endAt: input.endAt,
    windowSize: 30,
    stride: 1,
    featureSetVersionId: featureSet,
  };

  const preview = config.mock
    ? buildMockPreview(previewRequest, featureSet)
    : await rlServiceClient.datasetPreview(previewRequest);

  const version = normalizePreviewVersion(preview.version as DatasetPreviewResponse["version"] & Record<string, unknown>);
  const dataset = await insertDatasetVersion({
    pair: version.pair,
    interval: version.interval,
    start_at: version.start_at,
    end_at: version.end_at,
    checksum: version.checksum,
    feature_set_version_id: featureSet,
  });

  await insertDatasetLineage({
    dataset_id: dataset.id,
    source_run_ids: await latestSourceRunIds(),
    parent_dataset_ids: [],
  });

  return dataset;
}
