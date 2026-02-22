import { expect, test } from "@playwright/test";
import { apiRequest } from "./fixtures";
import { fetchRiskLimitSets, startAgentRun, stopAgentRun, triggerDecision } from "./fixtures/rl-agent";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable OOD safety e2e tests.");

function buildOutlierCandles(count = 40) {
  const now = Date.now();
  return Array.from({ length: count }).map((_, idx) => {
    const base = 2300 + idx * 0.2;
    const close = idx === count - 1 ? base * 2.2 : base;
    return {
      timestamp: new Date(now - (count - idx) * 60000).toISOString(),
      open: base,
      high: close + 2,
      low: base - 2,
      close,
      volume: 100 + idx,
    };
  });
}

test("OOD features force hold behavior", async () => {
  const api = await apiRequest();
  const riskSets = await fetchRiskLimitSets(api);
  const run = await startAgentRun(api, {
    mode: "live",
    pair: "Gold-USDT",
    riskLimitSetId: riskSets[0].id,
    learningEnabled: true,
    learningWindowMinutes: 30,
  });

  const decision = await triggerDecision(api, run.id, {
    market: {
      pair: "Gold-USDT",
      candles: buildOutlierCandles(),
      lastPrice: 5000,
      spread: 1,
    },
  });

  expect(decision.decision.action).toBe("hold");
  expect(decision.warnings.some((warning: string) => warning.includes("feature_quality_gate"))).toBeTruthy();

  await stopAgentRun(api);
});
