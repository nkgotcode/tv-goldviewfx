import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";
import { fetchRiskLimitSets, startAgentRun, stopAgentRun, buildMarketCandles, triggerDecision } from "./fixtures/rl-agent";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable RL agent e2e tests.");

test("Conflicting signals yield neutral decision", async () => {
  const api = await apiRequest();
  const limits = await fetchRiskLimitSets(api);
  const limitId = limits[0]?.id;
  expect(limitId).toBeTruthy();

  const run = await startAgentRun(api, {
    mode: "paper",
    pair: "Gold-USDT",
    riskLimitSetId: limitId,
    learningEnabled: true,
    learningWindowMinutes: 30,
  });

  const decision = await triggerDecision(api, run.id, {
    market: { candles: buildMarketCandles(), lastPrice: 2302.5, spread: 0.4 },
    signals: [
      { source: "signals", timestamp: new Date().toISOString(), score: 0.6 },
      { source: "signals", timestamp: new Date().toISOString(), score: -0.55 },
    ],
  });

  expect(decision.warnings).toContain("conflicting_signals");
  expect(decision.decision.action).toBe("hold");

  await stopAgentRun(api);
});
