import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";
import { readListResponse } from "./fixtures/api_list";
import { runEvaluation } from "./fixtures/rl-evaluations";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable RL evaluation e2e tests.");

test("Evaluation workflow returns pass report", async ({ page }) => {
  const api = await apiRequest();
  const versionsResponse = await api.get("/agents/gold-rl-agent/versions");
  expect(versionsResponse.ok()).toBeTruthy();
  const versions = readListResponse<{ id: string }>(await versionsResponse.json());
  const versionId = versions[0]?.id;
  expect(versionId).toBeTruthy();

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 30 * 60 * 60 * 1000);

  const report = await runEvaluation(api, {
    pair: "Gold-USDT",
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    agentVersionId: versionId,
  });

  expect(report.status).toBe("pass");

  await page.goto("/rl-evaluations");
  await expect(page.getByRole("heading", { name: "Evaluation Command" })).toBeVisible();
});
