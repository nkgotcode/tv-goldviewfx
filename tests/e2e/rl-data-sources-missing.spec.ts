import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";
import { fetchDataSourceStatus, updateDataSourceConfig } from "./fixtures/rl-data-sources";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable RL data source e2e tests.");

test("Missing market data sources are flagged as unavailable", async ({ page }) => {
  const api = await apiRequest();

  await updateDataSourceConfig(api, {
    sources: [{ sourceType: "bingx_candles", enabled: true, freshnessThresholdSeconds: 120 }],
  });

  const status = await fetchDataSourceStatus(api, "Gold-USDT");
  const candles = status.find((source) => source.source_type === "bingx_candles");
  const mockEnabled = ["1", "true", "yes", "on"].includes(
    (process.env.BINGX_MARKET_DATA_MOCK ?? "").trim().toLowerCase(),
  );
  if (mockEnabled) {
    expect(candles?.status).toBe("unavailable");
  } else {
    expect(["ok", "stale"]).toContain(candles?.status);
  }

  await page.goto("/rl-data-sources");
  await expect(page.getByRole("heading", { name: "Data Source Guardrails" })).toBeVisible();
});
