import { test, expect } from "@playwright/test";

const dashboardBaseUrl =
  process.env.E2E_DASHBOARD_BASE_URL ?? process.env.E2E_BASE_URL ?? ("" as string);

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable dashboard e2e tests.");

test("Idea review modal shows governance panels", async ({ page }) => {
  const base = dashboardBaseUrl || "http://localhost:3000";
  await page.goto(base);
  const firstIdea = page.locator("table tbody tr td button").first();
  if ((await firstIdea.count()) === 0) {
    test.skip(true, "No ideas available to open modal");
  }
  await firstIdea.click();
  await expect(page.getByText(/Review Status/i)).toBeVisible();
  await expect(page.getByText(/Notes/i)).toBeVisible();
  await expect(page.getByText(/OCR Enrichment/i)).toBeVisible();
});
