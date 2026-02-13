import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";
import { parseListResponse } from "./fixtures/api_list";
import { opsAlertSchema } from "./fixtures/schemas";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable e2e tests.");

test("Ops alerts endpoint returns list", async () => {
  const api = await apiRequest();
  const response = await api.get("/ops/alerts");
  expect(response.status()).toBe(200);
  const payload = parseListResponse(opsAlertSchema, await response.json());
  expect(Array.isArray(payload)).toBe(true);
});
