import { test, expect } from "bun:test";
import { detectCandleGaps } from "../../src/services/data_gap_service";

test("detectCandleGaps detects missing intervals", () => {
  const base = Date.parse("2026-01-12T00:00:00Z");
  const intervalMs = 60_000;
  const times = [
    new Date(base).toISOString(),
    new Date(base + 2 * intervalMs).toISOString(),
    new Date(base + 3 * intervalMs).toISOString(),
  ];

  const gaps = detectCandleGaps(times, intervalMs, 1);
  expect(gaps.length).toBe(1);
  expect(gaps[0].missingPoints).toBe(1);
  expect(gaps[0].gapStart).toBe(new Date(base + intervalMs).toISOString());
});

test("detectCandleGaps respects minMissingPoints", () => {
  const base = Date.parse("2026-01-12T00:00:00Z");
  const intervalMs = 60_000;
  const times = [
    new Date(base).toISOString(),
    new Date(base + 2 * intervalMs).toISOString(),
  ];

  const gaps = detectCandleGaps(times, intervalMs, 2);
  expect(gaps.length).toBe(0);
});
