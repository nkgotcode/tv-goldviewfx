import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";
import { runEvaluation } from "./fixtures/rl-evaluations";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable RL evaluation e2e tests.");

test("Evaluation fails when thresholds are not met", async ({ page }) => {
  const api = await apiRequest();
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 2 * 60 * 60 * 1000);

  const report = await runEvaluation(api, {
    pair: "Gold-USDT",
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  });

  expect(report.status).toBe("fail");

  await page.goto("/rl-evaluations");
  await expect(page.getByText("Evaluation History")).toBeVisible();
});
