import { test, expect } from "bun:test";
import { buildMockEvaluation, normalizeEvaluationReport } from "../../src/services/evaluation_service";

test("buildMockEvaluation marks long windows as pass", () => {
  const now = new Date();
  const payload = {
    pair: "Gold-USDT",
    periodStart: new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString(),
    periodEnd: now.toISOString(),
  };

  const report = buildMockEvaluation(payload);
  expect(report.trade_count).toBeGreaterThanOrEqual(20);
  expect(report.status).toBe("pass");
});

test("buildMockEvaluation marks short windows as fail", () => {
  const now = new Date();
  const payload = {
    pair: "Gold-USDT",
    periodStart: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    periodEnd: now.toISOString(),
  };

  const report = buildMockEvaluation(payload);
  expect(report.trade_count).toBeLessThan(20);
  expect(report.status).toBe("fail");
});

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
