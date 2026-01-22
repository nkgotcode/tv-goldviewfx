import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";

const dashboardBaseUrl =
  process.env.E2E_DASHBOARD_BASE_URL ?? process.env.E2E_BASE_URL ?? "http://localhost:3000";
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://localhost:8787";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable dashboard detail tests.");

test("Trade detail page opens", async ({ page }) => {
  const api = await apiRequest(apiBaseUrl);
  const tradesResponse = await api.get("/trades");
  expect(tradesResponse.ok()).toBeTruthy();
  const trades = await tradesResponse.json();
  if (!Array.isArray(trades) || trades.length === 0) {
    test.skip(true, "No trades available");
  }

  const tradeId = trades[0].id;
  await page.goto(`${dashboardBaseUrl}/trades/${tradeId}`);
  await expect(page.getByRole("heading", { name: /trade detail/i })).toBeVisible();
});
