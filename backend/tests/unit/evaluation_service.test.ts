import { test, expect } from "bun:test";
import { DataGapBlockedError, isDataGapBlockedError, normalizeEvaluationReport } from "../../src/services/evaluation_service";

test("normalizeEvaluationReport accepts camelCase payloads", () => {
  const report = normalizeEvaluationReport({
    winRate: 0.6,
    netPnlAfterFees: 120,
    maxDrawdown: 0.12,
    tradeCount: 40,
    exposureByPair: { "Gold-USDT": 1000 },
    status: "pass",
  });

  expect(report.win_rate).toBeCloseTo(0.6);
  expect(report.net_pnl_after_fees).toBe(120);
  expect(report.max_drawdown).toBe(0.12);
  expect(report.trade_count).toBe(40);
  expect(report.status).toBe("pass");
});

test("normalizeEvaluationReport preserves fold/interval diagnostics metadata", () => {
  const metadata = {
    fold_metrics: [
      { fold: 1, status: "fail", reason_codes: ["insufficient_rows"] },
      { fold: 2, status: "pass", reason_codes: [] },
    ],
    nautilus: {
      metrics: {
        interval_matrix: {
          results: [
            { interval: "1m", status: "fail", reason_codes: ["insufficient_rows"] },
            { interval: "5m", status: "pass", reason_codes: [] },
          ],
        },
      },
    },
  };

  const report = normalizeEvaluationReport({
    win_rate: 0.42,
    net_pnl_after_fees: -20,
    max_drawdown: 0.2,
    trade_count: 8,
    exposure_by_pair: { XAUTUSDT: 1000 },
    metadata,
  });

  expect(report.status).toBe("fail");
  expect(report.metadata).toEqual(metadata);
});

test("isDataGapBlockedError identifies typed gap-blocking failures", () => {
  const error = new DataGapBlockedError("blocked", {
    pair: "Gold-USDT",
    interval: "1m",
    blockingReasons: ["candle_gaps_detected"],
    warnings: [],
    integrityProvenance: {},
    gapHealth: null,
  });
  expect(isDataGapBlockedError(error)).toBe(true);
  expect(error.code).toBe("DATA_GAP_BLOCKED");
});
