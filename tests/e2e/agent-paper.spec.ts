import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";
import { parseListResponse } from "./fixtures/api_list";
import { ideaSchema, tradeSchema } from "./fixtures/schemas";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable agent e2e tests.");

test("Paper trading flow creates trades", async () => {
  const api = await apiRequest();

  await api.post("/sync/tradingview", { data: { full_content: false } });

  const ideasResponse = await api.get("/ideas");
  expect(ideasResponse.ok()).toBeTruthy();
  const ideas = parseListResponse(ideaSchema, await ideasResponse.json());
  if (!Array.isArray(ideas) || ideas.length === 0) {
    test.skip(true, "No ideas available for enrichment");
  }

  const ideaId = ideas[0].id;
  await api.post("/enrichment/run", { data: { idea_ids: [ideaId] } });

  await api.put("/agent/config", {
    data: { enabled: true, max_position_size: 1, mode: "paper" },
  });

  const enableResponse = await api.post("/agent/enable");
  expect(enableResponse.ok()).toBeTruthy();

  const tradesResponse = await api.get("/trades");
  expect(tradesResponse.ok()).toBeTruthy();
  const trades = parseListResponse(tradeSchema, await tradesResponse.json());
  expect(Array.isArray(trades)).toBe(true);
});
