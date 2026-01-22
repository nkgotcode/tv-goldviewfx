import type { DataSourceStatusInsert } from "../../src/db/repositories/data_source_status";

export const dataSourceStatusFixtures: DataSourceStatusInsert[] = [
  {
    source_type: "bingx_candles",
    pair: "Gold-USDT",
    last_seen_at: new Date(Date.now() - 30_000).toISOString(),
    freshness_threshold_seconds: 120,
    status: "ok",
  },
  {
    source_type: "ideas",
    pair: "Gold-USDT",
    last_seen_at: new Date(Date.now() - 90_000).toISOString(),
    freshness_threshold_seconds: 120,
    status: "stale",
  },
];
