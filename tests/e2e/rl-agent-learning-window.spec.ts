import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";
import { fetchRiskLimitSets, startAgentRun, stopAgentRun, buildMarketCandles, triggerDecision, triggerLearningUpdate } from "./fixtures/rl-agent";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable RL agent e2e tests.");

test("Learning updates run without interrupting trading", async () => {
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

  await triggerDecision(api, run.id, {
    market: { candles: buildMarketCandles(), lastPrice: 2302.5, spread: 0.4 },
  });

  const versionsResponse = await api.get("/agents/gold-rl-agent/versions");
  const versions = await versionsResponse.json();
  const versionId = versions[0]?.id;
  expect(versionId).toBeTruthy();

  await triggerLearningUpdate(api, {
    agentVersionId: versionId,
    pair: "Gold-USDT",
    windowStart: new Date(Date.now() - 3600000).toISOString(),
    windowEnd: new Date().toISOString(),
    metrics: { winRate: 0.6, netPnlAfterFees: 100, maxDrawdown: 0.1, tradeCount: 30 },
  });

  const statusResponse = await api.get("/agents/gold-rl-agent");
  const status = await statusResponse.json();
  expect(status.currentRun.status).toBe("running");

  await stopAgentRun(api);
});
