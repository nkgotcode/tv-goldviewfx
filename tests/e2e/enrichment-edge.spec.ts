import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable enrichment edge tests.");

test("Enrichment rejects invalid payload", async () => {
  const api = await apiRequest();

  const response = await api.post("/enrichment/run", {
    data: { idea_ids: "nope" },
  });

  expect(response.status()).toBe(400);
});
