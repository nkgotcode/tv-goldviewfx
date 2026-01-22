import { test, expect } from "bun:test";
import { summarizeDataGapEvents } from "../../src/services/data_gap_health";

test("summarizeDataGapEvents aggregates open and healing gaps", () => {
  const events = [
    {
      pair: "Gold-USDT",
      source_type: "bingx_candles",
      status: "open",
      detected_at: "2026-01-12T00:00:00Z",
      last_seen_at: "2026-01-12T00:05:00Z",
    },
    {
      pair: "Gold-USDT",
      source_type: "bingx_candles",
      status: "healing",
      detected_at: "2026-01-12T00:10:00Z",
      last_seen_at: "2026-01-12T00:10:00Z",
    },
    {
      pair: "PAXGUSDT",
      source_type: "news",
      status: "open",
      detected_at: "2026-01-12T00:15:00Z",
      last_seen_at: "2026-01-12T00:20:00Z",
    },
  ];

  const summary = summarizeDataGapEvents(events);
  expect(summary.totals.open).toBe(2);
  expect(summary.totals.healing).toBe(1);
  expect(summary.by_pair.length).toBe(2);
  expect(summary.by_source.length).toBe(2);
  expect(summary.by_pair.find((entry) => entry.pair === "Gold-USDT")?.healing).toBe(1);
  expect(summary.by_source.find((entry) => entry.source_type === "bingx_candles")?.open).toBe(1);
  expect(summary.totals.last_detected_at).toBe("2026-01-12T00:15:00Z");
});
