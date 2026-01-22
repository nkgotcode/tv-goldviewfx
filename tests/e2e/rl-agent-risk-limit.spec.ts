import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";
import { startAgentRun, triggerDecision, buildMarketCandles, stopAgentRun } from "./fixtures/rl-agent";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable RL agent e2e tests.");

test("Risk limit breach pauses run", async () => {
  const api = await apiRequest();

  const riskLimitResponse = await api.post("/risk-limits", {
    data: {
      name: `Limit Breach ${Date.now()}`,
      maxPositionSize: 1,
      leverageCap: 1,
      maxDailyLoss: 10,
      maxDrawdown: 20,
      maxOpenPositions: 1,
    },
  });
  expect(riskLimitResponse.ok()).toBeTruthy();
  const limit = await riskLimitResponse.json();

  const run = await startAgentRun(api, {
    mode: "paper",
    pair: "XAUTUSDT",
    riskLimitSetId: limit.id,
    learningEnabled: true,
    learningWindowMinutes: 30,
  });

  await triggerDecision(api, run.id, {
    market: { candles: buildMarketCandles(), lastPrice: 2302.5, spread: 0.5 },
    ideas: [{ source: "ideas", timestamp: new Date().toISOString(), score: 0.2 }],
    simulateExecutionStatus: "filled",
  });

  await triggerDecision(api, run.id, {
    market: { candles: buildMarketCandles(), lastPrice: 2303.5, spread: 0.5 },
    ideas: [{ source: "ideas", timestamp: new Date().toISOString(), score: 0.2 }],
  });

  const statusResponse = await api.get("/agents/gold-rl-agent");
  expect(statusResponse.ok()).toBeTruthy();
  const status = await statusResponse.json();
  expect(status.currentRun.status).toBe("paused");

  await stopAgentRun(api);
});
