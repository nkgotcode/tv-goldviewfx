import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable TradingView dedup tests.");

test("TradingView sync is idempotent", async () => {
  const api = await apiRequest();

  const first = await api.post("/sync/tradingview", {
    data: { full_content: false },
  });
  expect(first.ok()).toBeTruthy();
  const firstPayload = await first.json();

  const second = await api.post("/sync/tradingview", {
    data: { full_content: false },
  });
  expect(second.ok()).toBeTruthy();
  const secondPayload = await second.json();

  expect(firstPayload.newCount).toBeGreaterThanOrEqual(0);
  expect(secondPayload.newCount).toBe(0);
});
