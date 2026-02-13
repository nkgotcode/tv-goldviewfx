import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";
import { parseListResponse } from "./fixtures/api_list";
import { agentVersionSchema } from "./fixtures/schemas";
import { triggerLearningUpdate } from "./fixtures/rl-agent";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable RL agent e2e tests.");

test("Learning rollback promotes fallback version", async () => {
  const api = await apiRequest();
  const versionsResponse = await api.get("/agents/gold-rl-agent/versions");
  const versions = parseListResponse(agentVersionSchema, await versionsResponse.json());

  const promoted = versions.find((version: any) => version.status === "promoted");
  const retired = versions.find((version: any) => version.status === "retired");
  expect(promoted).toBeTruthy();
  expect(retired).toBeTruthy();

  await triggerLearningUpdate(api, {
    agentVersionId: promoted.id,
    pair: "Gold-USDT",
    windowStart: new Date(Date.now() - 3600000).toISOString(),
    windowEnd: new Date().toISOString(),
    metrics: { winRate: 0.2, netPnlAfterFees: -10, maxDrawdown: 0.4, tradeCount: 5 },
    rollbackVersionId: retired.id,
  });

  const refreshedResponse = await api.get("/agents/gold-rl-agent/versions");
  const refreshed = parseListResponse(agentVersionSchema, await refreshedResponse.json());
  const rollbackTarget = refreshed.find((version: any) => version.id === retired.id);
  expect(rollbackTarget.status).toBe("promoted");
});
