import { test, expect } from "@playwright/test";

const dashboardBaseUrl =
  process.env.E2E_DASHBOARD_BASE_URL ?? process.env.E2E_BASE_URL ?? ("" as string);

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable dashboard e2e tests.");

test("Trading safety controls render", async ({ page }) => {
  const base = dashboardBaseUrl || "http://localhost:3000";
  const target = `${base.replace(/\/$/, "")}/controls`;
  await page.goto(target);
  await expect(page.getByRole("heading", { name: /Trade Controls/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Source Gating/i })).toBeVisible();
});
