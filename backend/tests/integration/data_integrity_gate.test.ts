import { test, expect } from "bun:test";
import { evaluateDataIntegrityGate } from "../../src/services/data_integrity_service";
import { upsertDataSourceStatus } from "../../src/db/repositories/data_source_status";

const hasEnv = Boolean(process.env.CONVEX_URL);

function buildCandles(timestamps: string[]) {
  return timestamps.map((timestamp, idx) => ({
    timestamp,
    open: 100 + idx,
    high: 101 + idx,
    low: 99 + idx,
    close: 100 + idx,
    volume: 10,
  }));
}

if (!hasEnv) {
  test.skip("data integrity gate requires Convex configuration", () => {});
} else {
  test("data integrity blocks missing candles", async () => {
    const result = await evaluateDataIntegrityGate({ pair: "Gold-USDT", candles: [] });
    expect(result.allowed).toBe(false);
    expect(result.blockingReasons).toContain("missing_candles");
  });

  test("data integrity detects candle gaps", async () => {
    const base = Date.now();
    const timestamps = [
      new Date(base - 5 * 60_000).toISOString(),
      new Date(base - 4 * 60_000).toISOString(),
      new Date(base - 1 * 60_000).toISOString(),
    ];
    const result = await evaluateDataIntegrityGate({
      pair: "Gold-USDT",
      candles: buildCandles(timestamps),
      now: new Date(base),
    });
    expect(result.blockingReasons).toContain("candle_gaps_detected");
  });

  test("data integrity flags cross-source divergence", async () => {
    const now = new Date();
    await upsertDataSourceStatus({
      pair: "Gold-USDT",
      source_type: "bingx_candles",
      last_seen_at: new Date(now.getTime() - 60_000).toISOString(),
      freshness_threshold_seconds: 120,
      status: "ok",
      updated_at: now.toISOString(),
    });
    await upsertDataSourceStatus({
      pair: "Gold-USDT",
      source_type: "bingx_ticker",
      last_seen_at: new Date(now.getTime() - 10 * 60_000).toISOString(),
      freshness_threshold_seconds: 120,
      status: "ok",
      updated_at: now.toISOString(),
    });

    const timestamps = [
      new Date(now.getTime() - 2 * 60_000).toISOString(),
      new Date(now.getTime() - 60_000).toISOString(),
    ];

    const result = await evaluateDataIntegrityGate({
      pair: "Gold-USDT",
      candles: buildCandles(timestamps),
      now,
    });

    expect(result.blockingReasons).toContain("cross_source_divergence");
  });

  test("data integrity warns on unsorted candles", async () => {
    const base = Date.now();
    const timestamps = [
      new Date(base - 2 * 60_000).toISOString(),
      new Date(base - 4 * 60_000).toISOString(),
      new Date(base - 3 * 60_000).toISOString(),
    ];

    const result = await evaluateDataIntegrityGate({
      pair: "Gold-USDT",
      candles: buildCandles(timestamps),
      now: new Date(base),
    });

    expect(result.warnings).toContain("candles_unsorted");
  });
}
