import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";
import { fetchRiskLimitSets, startAgentRun, stopAgentRun, triggerDecision } from "./fixtures/rl-agent";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable RL agent e2e tests.");

test("Volatility spike safety pauses run", async () => {
  const api = await apiRequest();
  const limits = await fetchRiskLimitSets(api);
  const limitId = limits[0]?.id;
  expect(limitId).toBeTruthy();

  const run = await startAgentRun(api, {
    mode: "paper",
    pair: "XAUTUSDT",
    riskLimitSetId: limitId,
    learningEnabled: true,
    learningWindowMinutes: 30,
  });

  const candles = [
    { timestamp: new Date(Date.now() - 120000).toISOString(), open: 2000, high: 2002, low: 1998, close: 2000, volume: 100 },
    { timestamp: new Date().toISOString(), open: 2400, high: 2450, low: 2350, close: 2400, volume: 140 },
  ];

  const decision = await triggerDecision(api, run.id, {
    market: { candles },
  });

  expect(decision.warnings).toContain("volatility_spike");

  const statusResponse = await api.get("/agents/gold-rl-agent");
  const status = await statusResponse.json();
  expect(status.currentRun.status).toBe("paused");

  await stopAgentRun(api);
});
