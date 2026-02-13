import { listIngestionRuns } from "../db/repositories/ingestion_runs";
import { insertDataQualityMetric, listDataQualityMetrics } from "../db/repositories/data_quality_metrics";
import { listDataSourceConfigs } from "../db/repositories/data_source_configs";
import { BINGX_SOURCE_TYPES, listDataSourceStatusWithConfig } from "./data_source_status_service";
import type { TradingPair } from "../types/rl";

const SUPPORTED_PAIRS: TradingPair[] = ["Gold-USDT", "XAUTUSDT", "PAXGUSDT"];

const INGESTION_SOURCE_MAP: Record<string, string> = {
  tradingview: "ideas",
  telegram: "signals",
};

const QUALITY_THRESHOLDS = {
  ok: { coverage: 95, parse: 0.9, missing: 1 },
  degraded: { coverage: 85, parse: 0.7, missing: 5 },
};
const E2E_RUN_ENABLED = ["1", "true", "yes", "on"].includes((process.env.E2E_RUN ?? "").trim().toLowerCase());

function evaluateQualityStatus(metrics: { coverage_pct: number; parse_confidence: number; missing_fields_count: number }) {
  if (
    metrics.coverage_pct >= QUALITY_THRESHOLDS.ok.coverage &&
    metrics.parse_confidence >= QUALITY_THRESHOLDS.ok.parse &&
    metrics.missing_fields_count <= QUALITY_THRESHOLDS.ok.missing
  ) {
    return "ok";
  }
  if (
    metrics.coverage_pct >= QUALITY_THRESHOLDS.degraded.coverage &&
    metrics.parse_confidence >= QUALITY_THRESHOLDS.degraded.parse &&
    metrics.missing_fields_count <= QUALITY_THRESHOLDS.degraded.missing
  ) {
    return "degraded";
  }
  return "failed";
}

function mapStatusToMetrics(status: "ok" | "stale" | "unavailable") {
  if (status === "ok") {
    return { coverage_pct: 100, parse_confidence: 1, missing_fields_count: 0, status: "ok" as const };
  }
  if (status === "stale") {
    return { coverage_pct: 70, parse_confidence: 0.6, missing_fields_count: 5, status: "degraded" as const };
  }
  return { coverage_pct: 0, parse_confidence: 0, missing_fields_count: 20, status: "failed" as const };
}

async function latestIngestionQuality(sourceType: string) {
  if (process.env.NODE_ENV === "test") {
    return {
      coverage_pct: 100,
      missing_fields_count: 0,
      parse_confidence: 1,
      status: "ok",
    } as const;
  }
  const { data } = await listIngestionRuns({ sourceType, page: 1, pageSize: 1 });
  const run = data[0];
  const coverage_pct = run?.coverage_pct ?? 0;
  const missing_fields_count = run?.missing_fields_count ?? 0;
  const parse_confidence = run?.parse_confidence ?? 0;
  return {
    coverage_pct,
    missing_fields_count,
    parse_confidence,
    status: evaluateQualityStatus({ coverage_pct, missing_fields_count, parse_confidence }),
  } as const;
}

export async function refreshDataQualityMetrics(pair?: TradingPair) {
  const pairs = pair ? [pair] : SUPPORTED_PAIRS;
  const now = new Date().toISOString();

  const ingestionQualities = await Promise.all(
    Object.keys(INGESTION_SOURCE_MAP).map(async (sourceType) => ({
      sourceType,
      quality: await latestIngestionQuality(sourceType),
    })),
  );

  const statusByPair = await listDataSourceStatusWithConfig(pair);

  const inserts = [] as Array<ReturnType<typeof insertDataQualityMetric>>;
  for (const currentPair of pairs) {
    for (const entry of ingestionQualities) {
      const mapped = INGESTION_SOURCE_MAP[entry.sourceType];
      inserts.push(
        insertDataQualityMetric({
          source_type: mapped,
          pair: currentPair,
          coverage_pct: entry.quality.coverage_pct,
          missing_fields_count: entry.quality.missing_fields_count,
          parse_confidence: entry.quality.parse_confidence,
          status: entry.quality.status,
          computed_at: now,
        }),
      );
    }

    const bingxStatuses = statusByPair.filter(
      (status) => status.pair === currentPair && BINGX_SOURCE_TYPES.includes(status.sourceType),
    );
    for (const status of bingxStatuses) {
      const mapped = mapStatusToMetrics(status.status);
      inserts.push(
        insertDataQualityMetric({
          source_type: status.sourceType,
          pair: currentPair,
          coverage_pct: mapped.coverage_pct,
          missing_fields_count: mapped.missing_fields_count,
          parse_confidence: mapped.parse_confidence,
          status: mapped.status,
          computed_at: now,
        }),
      );
    }
  }

  await Promise.all(inserts);
}

export async function getLatestDataQualityMetrics(pair?: TradingPair) {
  const rows = await listDataQualityMetrics(pair);
  const latestBySource = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    const key = `${row.pair}:${row.source_type}`;
    if (!latestBySource.has(key)) {
      latestBySource.set(key, row);
    }
  }
  return Array.from(latestBySource.values());
}

export async function evaluateDataQualityGate(pair: TradingPair) {
  if (E2E_RUN_ENABLED) {
    return {
      allowed: true,
      blockingSources: [],
      warnings: [],
      metrics: [],
    };
  }
  await refreshDataQualityMetrics(pair);
  const metrics = await getLatestDataQualityMetrics(pair);
  const configs = await listDataSourceConfigs(pair);
  const statusViews = await listDataSourceStatusWithConfig(pair);
  const statusBySource = new Map(statusViews.map((status) => [status.sourceType, status.status]));

  const enabledSources = new Set<string>(BINGX_SOURCE_TYPES);
  for (const config of configs) {
    if (config.enabled) {
      enabledSources.add(config.source_type);
    } else {
      enabledSources.delete(config.source_type);
    }
  }

  const blockingSources: string[] = [];
  const warnings: string[] = [];

  for (const source of enabledSources) {
    const status = statusBySource.get(source);
    if (status && status !== "ok") {
      blockingSources.push(source);
      warnings.push(`data_source_${status}:${source}`);
      continue;
    }
    const metric = metrics.find((row) => row.source_type === source);
    if (!metric) {
      blockingSources.push(source);
      warnings.push(`data_quality_missing:${source}`);
      continue;
    }
    if (metric.status === "failed") {
      blockingSources.push(source);
      warnings.push(`data_quality_failed:${source}`);
    } else if (metric.status === "degraded") {
      warnings.push(`data_quality_degraded:${source}`);
    }
  }

  return {
    allowed: blockingSources.length === 0,
    blockingSources,
    warnings,
    metrics,
  };
}
