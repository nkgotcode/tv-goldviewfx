import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable RL evaluation e2e tests.");

test("Evaluation rejects missing data windows", async ({ page }) => {
  const api = await apiRequest();
  const now = new Date();

  const response = await api.post("/agents/gold-rl-agent/evaluations", {
    data: {
      pair: "Gold-USDT",
      periodStart: now.toISOString(),
      periodEnd: now.toISOString(),
    },
  });

  expect(response.status()).toBe(400);

  await page.goto("/rl-evaluations");
  await expect(page.getByRole("heading", { name: "Evaluation Command" })).toBeVisible();
});
