import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable ingestion e2e tests.");

test("Ingestion analytics and controls respond", async ({ page }) => {
  const api = await apiRequest();
  const identifier = `channel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const sourceResponse = await api.post("/telegram/sources", {
    data: { type: "telegram", identifier },
  });
  expect(sourceResponse.ok()).toBeTruthy();
  const source = await sourceResponse.json();

  const statusResponse = await api.get("/ingestion/status");
  expect(statusResponse.ok()).toBeTruthy();
  const status = await statusResponse.json();
  expect(status.tradingview).toBeTruthy();
  expect(status.telegram).toBeTruthy();
  expect(status.bingx?.pairs?.length).toBeGreaterThan(0);

  const tvResponse = await api.post("/ingestion/tradingview/sync", {
    data: { full_content: false, include_updates: false },
  });
  expect(tvResponse.status()).toBe(202);

  const tgResponse = await api.post("/ingestion/telegram/ingest", {
    data: { source_id: source.id },
  });
  expect(tgResponse.status()).toBe(202);

  const bxResponse = await api.post("/ingestion/bingx/refresh", {
    data: { pairs: ["Gold-USDT"], intervals: ["1m"], max_batches: 1 },
  });
  expect(bxResponse.status()).toBe(202);

  await page.goto("/ingestion");
  await expect(page.getByRole("heading", { name: "Ingestion Command" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "TradingView Sources" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Telegram Sources" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "BingX Market Feeds" })).toBeVisible();
});
