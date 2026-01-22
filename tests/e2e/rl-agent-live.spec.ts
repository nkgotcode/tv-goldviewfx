import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";
import { fetchRiskLimitSets, startAgentRun, stopAgentRun, triggerDecision, buildMarketCandles } from "./fixtures/rl-agent";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable RL agent e2e tests.");

test("Live trading flow starts and executes", async () => {
  const api = await apiRequest();
  const limits = await fetchRiskLimitSets(api);
  const limitId = limits[0]?.id;
  expect(limitId).toBeTruthy();

  const run = await startAgentRun(api, {
    mode: "live",
    pair: "Gold-USDT",
    riskLimitSetId: limitId,
    learningEnabled: true,
    learningWindowMinutes: 30,
  });

  const decision = await triggerDecision(api, run.id, {
    market: { candles: buildMarketCandles(), lastPrice: 2304.5, spread: 0.4 },
    ideas: [{ source: "ideas", timestamp: new Date().toISOString(), score: 0.5 }],
    simulateExecutionStatus: "filled",
  });

  expect(decision.tradeExecutionStatus).toBe("filled");
  await stopAgentRun(api);
});
