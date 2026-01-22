import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable TradingView e2e tests.");

test("TradingView sync returns a run id", async () => {
  const api = await apiRequest();
  const response = await api.post("/sync/tradingview", {
    data: { full_content: false },
  });

  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.runId).toBeTruthy();
});
