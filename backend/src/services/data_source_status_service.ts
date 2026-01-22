import { listDataSourceStatus, upsertDataSourceStatus } from "../db/repositories/data_source_status";
import { listDataSourceConfigs, upsertDataSourceConfig } from "../db/repositories/data_source_configs";
import type { DataSourceType, TradingPair } from "../types/rl";

export const BINGX_SOURCE_TYPES: DataSourceType[] = [
  "bingx_candles",
  "bingx_orderbook",
  "bingx_trades",
  "bingx_funding",
  "bingx_open_interest",
  "bingx_mark_price",
  "bingx_index_price",
  "bingx_ticker",
];

export const AUX_SOURCE_TYPES: DataSourceType[] = ["ideas", "signals", "news", "ocr_text", "trades"];
export const ALL_SOURCE_TYPES: DataSourceType[] = [...BINGX_SOURCE_TYPES, ...AUX_SOURCE_TYPES];

const SUPPORTED_PAIRS: TradingPair[] = ["Gold-USDT", "XAUTUSDT", "PAXGUSDT"];
const BINGX_MOCK_ENABLED = ["1", "true", "yes", "on"].includes(
  (process.env.BINGX_MARKET_DATA_MOCK ?? "").trim().toLowerCase(),
);
const E2E_RUN_ENABLED = ["1", "true", "yes", "on"].includes((process.env.E2E_RUN ?? "").trim().toLowerCase());

const DEFAULT_THRESHOLDS: Record<DataSourceType, number> = {
  bingx_candles: 120,
  bingx_orderbook: 60,
  bingx_trades: 120,
  bingx_funding: 60 * 60 * 8,
  bingx_open_interest: 120,
  bingx_mark_price: 120,
  bingx_index_price: 120,
  bingx_ticker: 120,
  ideas: 60 * 60,
  signals: 60 * 60,
  news: 60 * 60 * 6,
  ocr_text: 60 * 60 * 12,
  trades: 60 * 15,
};

export function getDefaultThreshold(sourceType: DataSourceType) {
  return DEFAULT_THRESHOLDS[sourceType];
}

export type SourceStatus = "ok" | "stale" | "unavailable";

export type DataSourceConfigRecord = {
  pair: TradingPair;
  sourceType: DataSourceType;
  enabled: boolean;
  freshnessThresholdSeconds: number;
};

export type DataSourceStatusView = {
  pair: TradingPair;
  sourceType: DataSourceType;
  enabled: boolean;
  freshnessThresholdSeconds: number;
  status: SourceStatus;
  lastSeenAt: string | null;
  updatedAt: string | null;
};

export function calculateFreshnessStatus(
  lastSeenAt: string | null,
  thresholdSeconds: number,
  now: Date = new Date(),
): SourceStatus {
  if (!lastSeenAt) return "unavailable";
  const last = new Date(lastSeenAt).getTime();
  if (Number.isNaN(last)) return "unavailable";
  const deltaSeconds = (now.getTime() - last) / 1000;
  return deltaSeconds > thresholdSeconds ? "stale" : "ok";
}

function defaultConfig(pair: TradingPair, sourceType: DataSourceType): DataSourceConfigRecord {
  const enabled = BINGX_SOURCE_TYPES.includes(sourceType) || (E2E_RUN_ENABLED && AUX_SOURCE_TYPES.includes(sourceType));
  return {
    pair,
    sourceType,
    enabled,
    freshnessThresholdSeconds: DEFAULT_THRESHOLDS[sourceType],
  };
}

export async function upsertDataSourceConfigRecord(config: DataSourceConfigRecord) {
  return upsertDataSourceConfig({
    pair: config.pair,
    source_type: config.sourceType,
    enabled: config.enabled,
    freshness_threshold_seconds: config.freshnessThresholdSeconds,
    updated_at: new Date().toISOString(),
  });
}

export async function listDataSourceStatusWithConfig(pair?: TradingPair, now: Date = new Date()) {
  const [statusRows, configRows] = await Promise.all([
    listDataSourceStatus(pair),
    listDataSourceConfigs(pair),
  ]);

  const statusByKey = new Map<string, typeof statusRows[number]>();
  for (const status of statusRows) {
    statusByKey.set(`${status.pair}:${status.source_type}`, status);
  }

  const configByKey = new Map<string, DataSourceConfigRecord>();
  for (const config of configRows) {
    configByKey.set(`${config.pair}:${config.source_type}`, {
      pair: config.pair,
      sourceType: config.source_type,
      enabled: config.enabled,
      freshnessThresholdSeconds: config.freshness_threshold_seconds,
    });
  }

  const pairs = pair ? [pair] : SUPPORTED_PAIRS;
  const views: DataSourceStatusView[] = [];

  for (const currentPair of pairs) {
    for (const sourceType of ALL_SOURCE_TYPES) {
      const key = `${currentPair}:${sourceType}`;
      const storedConfig = configByKey.get(key);
      const config = storedConfig ?? defaultConfig(currentPair, sourceType);
      const statusRow = statusByKey.get(key);
      const lastSeenAt =
        BINGX_MOCK_ENABLED && statusRow && BINGX_SOURCE_TYPES.includes(sourceType)
          ? now.toISOString()
          : statusRow?.last_seen_at ?? null;
      const updatedAt = statusRow?.updated_at ?? null;
      const status = statusRow
        ? calculateFreshnessStatus(lastSeenAt, config.freshnessThresholdSeconds, now)
        : storedConfig
          ? "unavailable"
          : "ok";
      views.push({
        pair: currentPair,
        sourceType,
        enabled: config.enabled,
        freshnessThresholdSeconds: config.freshnessThresholdSeconds,
        status,
        lastSeenAt,
        updatedAt,
      });
    }
  }

  return views;
}

export async function evaluateDataSourceGate(pair: TradingPair, now: Date = new Date()) {
  const statuses = await listDataSourceStatusWithConfig(pair, now);
  const disabledSources = statuses.filter((source) => !source.enabled).map((source) => source.sourceType);
  const blockingSources = statuses.filter((source) => source.enabled && source.status !== "ok");

  const warnings = [
    ...disabledSources.map((source) => `source_disabled:${source}`),
    ...blockingSources.map((source) => `source_${source.status}:${source.sourceType}`),
  ];

  return {
    allowed: blockingSources.length === 0,
    warnings,
    blockingSources: blockingSources.map((source) => source.sourceType),
    disabledSources,
  };
}

export async function recordDataSourceStatus(params: {
  pair: TradingPair;
  sourceType: DataSourceType;
  lastSeenAt: string | null;
  freshnessThresholdSeconds: number;
  now?: Date;
}) {
  const status = calculateFreshnessStatus(params.lastSeenAt, params.freshnessThresholdSeconds, params.now);
  return upsertDataSourceStatus({
    pair: params.pair,
    source_type: params.sourceType,
    last_seen_at: params.lastSeenAt,
    freshness_threshold_seconds: params.freshnessThresholdSeconds,
    status,
    updated_at: new Date().toISOString(),
  });
}

export async function markSourceUnavailable(pair: TradingPair, sourceType: DataSourceType, thresholdSeconds: number) {
  return upsertDataSourceStatus({
    pair,
    source_type: sourceType,
    last_seen_at: null,
    freshness_threshold_seconds: thresholdSeconds,
    status: "unavailable",
    updated_at: new Date().toISOString(),
  });
}
