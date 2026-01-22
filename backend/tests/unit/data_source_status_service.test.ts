import { test, expect } from "bun:test";
import { calculateFreshnessStatus } from "../../src/services/data_source_status_service";

test("calculateFreshnessStatus returns unavailable for missing timestamps", () => {
  expect(calculateFreshnessStatus(null, 60)).toBe("unavailable");
});

test("calculateFreshnessStatus returns ok within threshold", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const lastSeen = new Date(now.getTime() - 30 * 1000).toISOString();
  expect(calculateFreshnessStatus(lastSeen, 60, now)).toBe("ok");
});

test("calculateFreshnessStatus returns stale when threshold exceeded", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const lastSeen = new Date(now.getTime() - 120 * 1000).toISOString();
  expect(calculateFreshnessStatus(lastSeen, 60, now)).toBe("stale");
});
