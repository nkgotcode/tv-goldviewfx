import { listSourcesByType } from "../db/repositories/sources";
import { listSyncRuns } from "../db/repositories/sync_runs";
import { listDataSourceStatus } from "../db/repositories/data_source_status";
import { getIngestionConfig, listIngestionConfigs } from "../db/repositories/ingestion_configs";
import { getLatestIngestionRun } from "../db/repositories/ingestion_runs";
import { loadEnv } from "../config/env";
import { BINGX_SOURCE_TYPES } from "./data_source_status_service";
import { logWarn } from "./logger";
import type { DataSourceType, TradingPair } from "../types/rl";

const SUPPORTED_PAIRS: TradingPair[] = ["Gold-USDT", "XAUTUSDT", "PAXGUSDT"];
const BINGX_FEEDS = [
  "candles",
  "orderbook",
  "trades",
  "funding",
  "open_interest",
  "mark_index",
  "ticker",
] as const;

type SyncRunRow = {
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

export type SyncState = "ok" | "running" | "failed" | "unavailable";

export type IngestionSourceStatus = {
  id: string;
  identifier: string;
  display_name?: string | null;
  status: string;
  state: SyncState;
  last_run: SyncRunRow | null;
  last_run_at: string | null;
};

export type BingxFeedStatus = {
  source_type: DataSourceType;
  status: "ok" | "stale" | "unavailable";
  last_seen_at: string | null;
  freshness_threshold_seconds: number | null;
  updated_at: string | null;
};

export type BingxPairStatus = {
  pair: TradingPair;
  overall_status: "ok" | "stale" | "unavailable";
  last_updated_at: string | null;
  feeds: BingxFeedStatus[];
};

export type IngestionStatusResponse = {
  generated_at: string;
  tradingview: {
    overall_status: SyncState;
    last_run: SyncRunRow | null;
    sources: IngestionSourceStatus[];
  };
  telegram: {
    overall_status: SyncState;
    last_run: SyncRunRow | null;
    sources: IngestionSourceStatus[];
  };
  bingx: {
    overall_status: "ok" | "stale" | "unavailable";
    last_updated_at: string | null;
    pairs: BingxPairStatus[];
  };
};

export type OpsIngestionState = "ok" | "running" | "failed" | "paused" | "unavailable";

export type OpsIngestionStatusItem = {
  source_type: string;
  source_id: string | null;
  feed: string | null;
  enabled: boolean;
  refresh_interval_seconds: number | null;
  backoff_base_seconds: number | null;
  backoff_max_seconds: number | null;
  last_run: Record<string, unknown> | null;
  state: OpsIngestionState;
  last_run_at: string | null;
  next_run_at: string | null;
};

export type OpsIngestionStatusResponse = {
  generated_at: string;
  sources: OpsIngestionStatusItem[];
};

function toSyncState(run: SyncRunRow | null): SyncState {
  if (!run) return "unavailable";
  if (run.status === "running") return "running";
  if (run.status === "failed") return "failed";
  return "ok";
}

function pickLatestRun(runs: Array<SyncRunRow | null>) {
  let latest: SyncRunRow | null = null;
  let latestTime = 0;
  for (const run of runs) {
    if (!run) continue;
    const stamp = run.finished_at ?? run.started_at;
    const time = new Date(stamp).getTime();
    if (!Number.isNaN(time) && time > latestTime) {
      latestTime = time;
      latest = run;
    }
  }
  return latest;
}

function aggregateSyncState(states: SyncState[]): SyncState {
  if (states.length === 0) return "unavailable";
  if (states.includes("failed")) return "failed";
  if (states.includes("running")) return "running";
  if (states.includes("ok")) return "ok";
  return "unavailable";
}

function aggregateFeedStatus(statuses: Array<"ok" | "stale" | "unavailable">) {
  if (statuses.includes("unavailable")) return "unavailable";
  if (statuses.includes("stale")) return "stale";
  return "ok";
}

function normalizeFeedStatus(record: {
  source_type: DataSourceType;
  status: "ok" | "stale" | "unavailable";
  last_seen_at?: string | null;
  freshness_threshold_seconds?: number | null;
  updated_at?: string | null;
}): BingxFeedStatus {
  return {
    source_type: record.source_type,
    status: record.status,
    last_seen_at: record.last_seen_at ?? null,
    freshness_threshold_seconds: record.freshness_threshold_seconds ?? null,
    updated_at: record.updated_at ?? null,
  };
}

async function safeListSourcesByType(type: "tradingview" | "telegram") {
  try {
    return await listSourcesByType(type);
  } catch (error) {
    logWarn("Failed to load sources for ingestion status", { type, error: String(error) });
    return [];
  }
}

async function safeListSyncRuns(sourceId: string) {
  try {
    return await listSyncRuns(sourceId);
  } catch (error) {
    logWarn("Failed to load sync runs for ingestion status", { sourceId, error: String(error) });
    return [];
  }
}

async function buildSourceStatuses(type: "tradingview" | "telegram") {
  const sources = await safeListSourcesByType(type);
  const statuses = await Promise.all(
    sources.map(async (source) => {
      const runs = await safeListSyncRuns(source.id);
      const lastRun = (runs[0] as SyncRunRow | undefined) ?? null;
      const state = toSyncState(lastRun);
      const lastRunAt = lastRun ? lastRun.finished_at ?? lastRun.started_at ?? null : null;
      const status: IngestionSourceStatus = {
        id: source.id,
        identifier: source.identifier,
        display_name: source.display_name ?? null,
        status: source.status,
        state,
        last_run: lastRun,
        last_run_at: lastRunAt,
      };
      return status;
    }),
  );
  const overall = aggregateSyncState(statuses.map((item) => item.state));
  const lastRun = pickLatestRun(statuses.map((item) => item.last_run));
  return { sources: statuses, overall, lastRun };
}

export async function getIngestionStatus(): Promise<IngestionStatusResponse> {
  let dataSources: Awaited<ReturnType<typeof listDataSourceStatus>> = [];
  try {
    dataSources = await listDataSourceStatus();
  } catch (error) {
    logWarn("Failed to load data source status", { error: String(error) });
  }
  const [tradingview, telegram] = await Promise.all([
    buildSourceStatuses("tradingview"),
    buildSourceStatuses("telegram"),
  ]);

  const bingxRecords = dataSources.filter((item) =>
    BINGX_SOURCE_TYPES.includes(item.source_type as DataSourceType),
  );

  const bingxByPair = new Map<TradingPair, Map<DataSourceType, BingxFeedStatus>>();
  for (const pair of SUPPORTED_PAIRS) {
    bingxByPair.set(pair, new Map());
  }
  for (const record of bingxRecords) {
    const pair = record.pair as TradingPair;
    if (!bingxByPair.has(pair)) {
      bingxByPair.set(pair, new Map());
    }
    bingxByPair
      .get(pair)
      ?.set(record.source_type as DataSourceType, normalizeFeedStatus(record));
  }

  const pairs: BingxPairStatus[] = [];
  for (const pair of SUPPORTED_PAIRS) {
    const feeds = BINGX_SOURCE_TYPES.map((feed) => {
      const record = bingxByPair.get(pair)?.get(feed);
      if (record) {
        return record;
      }
      return {
        source_type: feed,
        status: "unavailable",
        last_seen_at: null,
        freshness_threshold_seconds: null,
        updated_at: null,
      };
    });
    const overall_status = aggregateFeedStatus(feeds.map((feed) => feed.status));
    const last_updated_at = feeds
      .map((feed) => feed.updated_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .slice(-1)[0] ?? null;
    pairs.push({ pair, overall_status, last_updated_at, feeds });
  }

  const bingxOverall = aggregateFeedStatus(pairs.map((pair) => pair.overall_status));
  const bingxUpdatedAt = pairs
    .map((pair) => pair.last_updated_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .slice(-1)[0] ?? null;

  return {
    generated_at: new Date().toISOString(),
    tradingview: {
      overall_status: tradingview.overall,
      last_run: tradingview.lastRun,
      sources: tradingview.sources,
    },
    telegram: {
      overall_status: telegram.overall,
      last_run: telegram.lastRun,
      sources: telegram.sources,
    },
    bingx: {
      overall_status: bingxOverall,
      last_updated_at: bingxUpdatedAt,
      pairs,
    },
  };
}

function toOpsState(enabled: boolean, run: { status?: string } | null): OpsIngestionState {
  if (!enabled) return "paused";
  if (!run) return "unavailable";
  if (run.status === "running") return "running";
  if (run.status === "failed") return "failed";
  return "ok";
}

function computeNextRunAt(lastRunAt: string | null, intervalSeconds: number | null): string | null {
  if (!intervalSeconds || intervalSeconds <= 0) return null;
  const base = lastRunAt ? new Date(lastRunAt).getTime() : Date.now();
  if (Number.isNaN(base)) return null;
  return new Date(base + intervalSeconds * 1000).toISOString();
}

export async function getOpsIngestionStatus(): Promise<OpsIngestionStatusResponse> {
  let refreshDefault = 3600;
  let bingxRefreshDefault = 3600;
  let backoffBaseDefault = 300;
  let backoffMaxDefault = 3600;
  try {
    const env = loadEnv();
    refreshDefault = env.INGESTION_DEFAULT_REFRESH_SECONDS;
    bingxRefreshDefault = env.BINGX_MARKET_DATA_INTERVAL_MIN * 60;
    backoffBaseDefault = env.INGESTION_DEFAULT_BACKOFF_BASE_SECONDS;
    backoffMaxDefault = env.INGESTION_DEFAULT_BACKOFF_MAX_SECONDS;
  } catch (error) {
    logWarn("Failed to load ingestion defaults from env", { error: String(error) });
  }

  let tradingviewSources: Awaited<ReturnType<typeof listSourcesByType>> = [];
  let telegramSources: Awaited<ReturnType<typeof listSourcesByType>> = [];
  let configs: Awaited<ReturnType<typeof listIngestionConfigs>> = [];
  try {
    tradingviewSources = await listSourcesByType("tradingview");
  } catch (error) {
    logWarn("Failed to load tradingview sources for ops ingestion status", { error: String(error) });
  }
  try {
    telegramSources = await listSourcesByType("telegram");
  } catch (error) {
    logWarn("Failed to load telegram sources for ops ingestion status", { error: String(error) });
  }
  try {
    configs = await listIngestionConfigs();
  } catch (error) {
    logWarn("Failed to load ingestion configs for ops ingestion status", { error: String(error) });
  }

  const configByKey = new Map<string, typeof configs[number]>();
  for (const config of configs) {
    const key = `${config.source_type}:${config.source_id ?? "none"}:${config.feed ?? "none"}`;
    configByKey.set(key, config);
  }

  const items: OpsIngestionStatusItem[] = [];

  for (const source of tradingviewSources) {
    const config = await getIngestionConfig("tradingview", source.id, null);
    const lastRun = await getLatestIngestionRun("tradingview", source.id, null);
    const refreshInterval = config?.refresh_interval_seconds ?? refreshDefault;
    const enabled = config?.enabled ?? true;
    const lastRunAt = lastRun?.finished_at ?? lastRun?.started_at ?? null;
    items.push({
      source_type: "tradingview",
      source_id: source.id,
      feed: null,
      enabled,
      refresh_interval_seconds: refreshInterval ?? null,
      backoff_base_seconds: config?.backoff_base_seconds ?? backoffBaseDefault,
      backoff_max_seconds: config?.backoff_max_seconds ?? backoffMaxDefault,
      last_run: lastRun ?? null,
      state: toOpsState(enabled, lastRun),
      last_run_at: lastRunAt,
      next_run_at: computeNextRunAt(lastRunAt, refreshInterval ?? null),
    });
  }

  for (const source of telegramSources) {
    const config = await getIngestionConfig("telegram", source.id, null);
    const lastRun = await getLatestIngestionRun("telegram", source.id, null);
    const refreshInterval = config?.refresh_interval_seconds ?? refreshDefault;
    const enabled = config?.enabled ?? true;
    const lastRunAt = lastRun?.finished_at ?? lastRun?.started_at ?? null;
    items.push({
      source_type: "telegram",
      source_id: source.id,
      feed: null,
      enabled,
      refresh_interval_seconds: refreshInterval ?? null,
      backoff_base_seconds: config?.backoff_base_seconds ?? backoffBaseDefault,
      backoff_max_seconds: config?.backoff_max_seconds ?? backoffMaxDefault,
      last_run: lastRun ?? null,
      state: toOpsState(enabled, lastRun),
      last_run_at: lastRunAt,
      next_run_at: computeNextRunAt(lastRunAt, refreshInterval ?? null),
    });
  }

  for (const feed of BINGX_FEEDS) {
    const key = `bingx:none:${feed}`;
    const config = configByKey.get(key) ?? (await getIngestionConfig("bingx", null, feed));
    const lastRun = await getLatestIngestionRun("bingx", null, feed);
    const refreshInterval = config?.refresh_interval_seconds ?? bingxRefreshDefault;
    const enabled = config?.enabled ?? true;
    const lastRunAt = lastRun?.finished_at ?? lastRun?.started_at ?? null;
    items.push({
      source_type: "bingx",
      source_id: null,
      feed,
      enabled,
      refresh_interval_seconds: refreshInterval ?? null,
      backoff_base_seconds: config?.backoff_base_seconds ?? backoffBaseDefault,
      backoff_max_seconds: config?.backoff_max_seconds ?? backoffMaxDefault,
      last_run: lastRun ?? null,
      state: toOpsState(enabled, lastRun),
      last_run_at: lastRunAt,
      next_run_at: computeNextRunAt(lastRunAt, refreshInterval ?? null),
    });
  }

  return { generated_at: new Date().toISOString(), sources: items };
}
