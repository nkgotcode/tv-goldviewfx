import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable e2e tests.");

test("Trade reconciliation endpoint responds", async () => {
  const api = await apiRequest();
  const response = await api.post("/ops/trading/reconcile");
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload).toHaveProperty("checked");
  expect(payload).toHaveProperty("updated");
});
