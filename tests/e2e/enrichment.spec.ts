import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";
import { parseListResponse } from "./fixtures/api_list";
import { ideaSchema } from "./fixtures/schemas";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable enrichment e2e tests.");

test("Enrichment run creates signals", async () => {
  const api = await apiRequest();

  const ideasResponse = await api.get("/ideas");
  expect(ideasResponse.ok()).toBeTruthy();
  const ideas = parseListResponse(ideaSchema, await ideasResponse.json());

  if (!Array.isArray(ideas) || ideas.length === 0) {
    test.skip(true, "No ideas available for enrichment");
  }

  const ideaId = ideas[0].id;
  const enrichmentResponse = await api.post("/enrichment/run", {
    data: { idea_ids: [ideaId] },
  });

  expect(enrichmentResponse.ok()).toBeTruthy();
  const payload = await enrichmentResponse.json();
  expect(payload.processed).toBeGreaterThanOrEqual(0);

  const signalsResponse = await api.get("/signals");
  expect(signalsResponse.ok()).toBeTruthy();
});
