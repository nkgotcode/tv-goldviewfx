import { expect, test } from "bun:test";
import {
  countBingxSourcePressure,
  shouldRunBingxFullBackfill,
} from "../../src/services/bingx_full_backfill_service";
import type { DataSourceStatusView } from "../../src/services/data_source_status_service";

function buildStatus(overrides: Partial<DataSourceStatusView>): DataSourceStatusView {
  return {
    pair: "XAUTUSDT",
    sourceType: "bingx_candles",
    enabled: true,
    freshnessThresholdSeconds: 120,
    status: "ok",
    lastSeenAt: null,
    updatedAt: null,
    ...overrides,
  };
}

test("counts only enabled non-ok BingX sources", () => {
  const statuses: DataSourceStatusView[] = [
    buildStatus({ sourceType: "bingx_candles", status: "stale" }),
    buildStatus({ sourceType: "bingx_trades", status: "unavailable" }),
    buildStatus({ sourceType: "bingx_orderbook", status: "ok" }),
    buildStatus({ sourceType: "ideas", status: "unavailable" }),
    buildStatus({ sourceType: "bingx_ticker", status: "stale", enabled: false }),
  ];
  const pressure = countBingxSourcePressure(statuses);
  expect(pressure).toEqual({
    nonOk: 2,
    stale: 1,
    unavailable: 1,
  });
});

test("runs full backfill when open gaps cross threshold", () => {
  const decision = shouldRunBingxFullBackfill({
    enabled: true,
    force: false,
    openGapCount: 3,
    nonOkSourceCount: 0,
    openGapThreshold: 2,
    nonOkThreshold: 1,
  });
  expect(decision).toEqual({ shouldRun: true, reason: "open_gaps" });
});

test("runs full backfill when non-ok source pressure crosses threshold", () => {
  const decision = shouldRunBingxFullBackfill({
    enabled: true,
    force: false,
    openGapCount: 0,
    nonOkSourceCount: 5,
    openGapThreshold: 1,
    nonOkThreshold: 3,
  });
  expect(decision).toEqual({ shouldRun: true, reason: "non_ok_sources" });
});

test("skips when healthy and not forced", () => {
  const decision = shouldRunBingxFullBackfill({
    enabled: true,
    force: false,
    openGapCount: 0,
    nonOkSourceCount: 0,
    openGapThreshold: 1,
    nonOkThreshold: 1,
  });
  expect(decision).toEqual({ shouldRun: false, reason: "healthy" });
});

test("forced mode overrides disabled state", () => {
  const decision = shouldRunBingxFullBackfill({
    enabled: false,
    force: true,
    openGapCount: 0,
    nonOkSourceCount: 0,
    openGapThreshold: 10,
    nonOkThreshold: 10,
  });
  expect(decision).toEqual({ shouldRun: true, reason: "forced" });
});
