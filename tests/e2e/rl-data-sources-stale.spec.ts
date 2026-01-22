import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";
import { fetchDataSourceStatus, updateDataSourceConfig } from "./fixtures/rl-data-sources";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable RL data source e2e tests.");

test("Stale sources surface when thresholds are exceeded", async ({ page }) => {
  const api = await apiRequest();

  await api.post("/ingestion/tradingview/sync", {
    data: { full_content: false, include_updates: false },
  });

  await updateDataSourceConfig(api, {
    sources: [{ sourceType: "ideas", enabled: true, freshnessThresholdSeconds: 1 }],
  });

  await new Promise((resolve) => setTimeout(resolve, 1500));

  const status = await fetchDataSourceStatus(api, "Gold-USDT");
  const ideas = status.find((source) => source.source_type === "ideas");
  expect(ideas?.status).toBe("stale");

  await page.goto("/rl-data-sources");
  await expect(page.getByText("Gold-USDT Feeds")).toBeVisible();
});
