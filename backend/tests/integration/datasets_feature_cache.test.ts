import { expect, test } from "bun:test";
import { upsertBingxCandles } from "../../src/db/repositories/bingx_market_data/candles";
import { createDatasetVersion } from "../../src/services/dataset_service";
import { resolveFeatureSetVersion } from "../../src/services/feature_set_service";

const hasEnv = process.env.DB_TEST_ENABLED === "true";

function buildCandles(start: Date, count: number, intervalMs: number) {
  const rows = [];
  for (let idx = 0; idx < count; idx += 1) {
    const openTime = new Date(start.getTime() + idx * intervalMs);
    const closeTime = new Date(openTime.getTime() + intervalMs);
    const base = 2300 + idx * 0.25;
    rows.push({
      pair: "Gold-USDT" as const,
      interval: "1m",
      open_time: openTime.toISOString(),
      close_time: closeTime.toISOString(),
      open: base,
      high: base + 0.6,
      low: base - 0.6,
      close: base + 0.2,
      volume: 120 + idx,
      quote_volume: 1200 + idx,
      source: "seed",
    });
  }
  return rows;
}

if (!hasEnv) {
  test.skip("dataset feature cache test requires database configuration", () => {});
} else {
  test("dataset hash is stable for same window and feature schema", async () => {
    const end = new Date();
    const start = new Date(end.getTime() - 90 * 60 * 1000);
    await upsertBingxCandles(buildCandles(start, 120, 60_000));
    const featureSet = await resolveFeatureSetVersion({
      version: "v2",
      includeNews: false,
      includeOcr: false,
      technical: { enabled: true },
    });

    const first = await createDatasetVersion({
      pair: "Gold-USDT",
      interval: "1m",
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      featureSetVersionId: featureSet.id,
      windowSize: 30,
      stride: 1,
    });
    const second = await createDatasetVersion({
      pair: "Gold-USDT",
      interval: "1m",
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      featureSetVersionId: featureSet.id,
      windowSize: 30,
      stride: 1,
    });

    expect(first.dataset_hash ?? first.checksum).toBe(second.dataset_hash ?? second.checksum);
  });
}
