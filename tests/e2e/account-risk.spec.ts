import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";
import { parseSingleResponse } from "./fixtures/api_list";
import { accountRiskSchema } from "./fixtures/schemas";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable e2e tests.");

test("Account risk summary returns policy and state", async () => {
  const api = await apiRequest();
  const response = await api.get("/ops/trading/risk");
  expect(response.status()).toBe(200);
  const payload = parseSingleResponse(accountRiskSchema, await response.json());
  expect(payload.policy).toBeTruthy();
  expect(payload.state).toBeTruthy();
  expect(payload).toHaveProperty("snapshot");
});
