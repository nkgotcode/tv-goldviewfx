import { expect, test } from "bun:test";
import { detectWsSequenceAnomaly } from "../../src/services/bingx_market_data_ws";

test("detects websocket kline gaps with deterministic missing-count", () => {
  const anomaly = detectWsSequenceAnomaly({
    previousEventMs: 1_000,
    currentEventMs: 241_000,
    expectedIntervalMs: 60_000,
  });

  expect(anomaly).not.toBeNull();
  expect(anomaly?.kind).toBe("gap");
  expect(anomaly?.missingEvents).toBe(3);
});

test("detects out-of-order websocket events", () => {
  const anomaly = detectWsSequenceAnomaly({
    previousEventMs: 120_000,
    currentEventMs: 119_500,
    expectedIntervalMs: 60_000,
  });

  expect(anomaly).not.toBeNull();
  expect(anomaly?.kind).toBe("out_of_order");
});

test("returns null for in-sequence websocket events", () => {
  const anomaly = detectWsSequenceAnomaly({
    previousEventMs: 60_000,
    currentEventMs: 120_000,
    expectedIntervalMs: 60_000,
  });
  expect(anomaly).toBeNull();
});
