import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";
import { fetchRiskLimitSets, startAgentRun, stopAgentRun, triggerDecision } from "./fixtures/rl-agent";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable RL agent e2e tests.");

test("Exchange maintenance halts decisions", async () => {
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
    market: { candles: [] },
  });

  expect(decision.decision.action).toBe("hold");
  expect(decision.warnings).toContain("exchange_maintenance");

  const statusResponse = await api.get("/agents/gold-rl-agent");
  const status = await statusResponse.json();
  expect(status.currentRun.status).toBe("paused");

  await stopAgentRun(api);
});
