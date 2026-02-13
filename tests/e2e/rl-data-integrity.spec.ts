import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";
import { fetchRiskLimitSets, startAgentRun, stopAgentRun, triggerDecision } from "./fixtures/rl-agent";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable RL agent e2e tests.");

test("Data integrity gate flags candle gaps", async () => {
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

  const now = Date.now();
  const candles = [
    { timestamp: new Date(now - 5 * 60_000).toISOString(), open: 1, high: 1, low: 1, close: 1, volume: 1 },
    { timestamp: new Date(now - 4 * 60_000).toISOString(), open: 1, high: 1, low: 1, close: 1, volume: 1 },
    { timestamp: new Date(now - 3 * 60_000).toISOString(), open: 1, high: 1, low: 1, close: 1, volume: 1 },
    { timestamp: new Date(now - 1 * 60_000).toISOString(), open: 1, high: 1, low: 1, close: 1, volume: 1 },
  ];

  const decision = await triggerDecision(api, run.id, {
    market: { candles },
  });

  expect(decision.warnings).toContain("data_integrity:candle_gaps_detected");

  await stopAgentRun(api);
});
