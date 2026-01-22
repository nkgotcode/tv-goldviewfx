import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable RL ops dashboard tests.");

test("Ops dashboard controls respond", async ({ page }) => {
  const api = await apiRequest();
  const identifier = `ops-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const sourceResponse = await api.post("/telegram/sources", { data: { type: "telegram", identifier } });
  expect(sourceResponse.ok()).toBeTruthy();

  const tvResponse = await api.post("/ingestion/tradingview/sync", {
    data: { full_content: false, include_updates: false },
  });
  expect(tvResponse.status()).toBe(202);

  const bxResponse = await api.post("/bingx/market-data/refresh", {
    data: { pairs: ["Gold-USDT"], maxBatches: 1 },
  });
  expect(bxResponse.status()).toBe(202);

  await page.goto("/rl-ops");
  await expect(page.getByRole("heading", { name: "Ops Command Center" })).toBeVisible();
  await expect(page.getByText("Ops Control Panel")).toBeVisible();
  await expect(page.getByText("Ingestion Run History")).toBeVisible();
});
