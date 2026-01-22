import { test, expect } from "@playwright/test";

const dashboardBaseUrl =
  process.env.E2E_DASHBOARD_BASE_URL ?? process.env.E2E_BASE_URL ?? ("" as string);

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable dashboard e2e tests.");

test("Dashboard renders summary and filters", async ({ page }) => {
  const base = dashboardBaseUrl || "http://localhost:3000";
  await page.goto(base);
  await expect(page.getByRole("heading", { name: /Goldviewfx Signal Command/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /TradingView Ideas/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Clear all filters/i })).toBeVisible();
});
