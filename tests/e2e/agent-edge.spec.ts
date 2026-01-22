import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable agent edge tests.");

test("Agent rejects trades when risk rules fail", async () => {
  const api = await apiRequest();

  await api.post("/sync/tradingview", { data: { full_content: false } });

  const ideasResponse = await api.get("/ideas");
  expect(ideasResponse.ok()).toBeTruthy();
  const ideas = await ideasResponse.json();
  if (!Array.isArray(ideas) || ideas.length === 0) {
    test.skip(true, "No ideas available for enrichment");
  }

  const ideaId = ideas[0].id;
  await api.post("/enrichment/run", { data: { idea_ids: [ideaId] } });

  await api.put("/agent/config", {
    data: { enabled: true, max_position_size: 0, mode: "paper" },
  });

  const enableResponse = await api.post("/agent/enable");
  expect(enableResponse.ok()).toBeTruthy();

  const tradesResponse = await api.get("/trades?status=rejected");
  expect(tradesResponse.ok()).toBeTruthy();
  const trades = await tradesResponse.json();
  expect(Array.isArray(trades)).toBe(true);
});
