import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable TradingView edge tests.");

test("TradingView sync rejects invalid payload", async () => {
  const api = await apiRequest();
  const response = await api.post("/sync/tradingview", {
    data: { full_content: "nope" },
  });

  expect(response.status()).toBe(400);
});
