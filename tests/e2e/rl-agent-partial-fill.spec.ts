import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";
import { fetchRiskLimitSets, startAgentRun, stopAgentRun, triggerDecision, buildMarketCandles } from "./fixtures/rl-agent";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable RL agent e2e tests.");

test("Partial fill handling keeps execution record", async () => {
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
    market: { candles: buildMarketCandles(), lastPrice: 2305.5, spread: 0.6 },
    signals: [{ source: "signals", timestamp: new Date().toISOString(), score: 0.4 }],
    simulateExecutionStatus: "partial",
  });

  expect(decision.tradeExecutionStatus).toBe("partial");
  await stopAgentRun(api);
});
