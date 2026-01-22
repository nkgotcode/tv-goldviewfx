import { test, expect } from "@playwright/test";
import { apiRequest } from "./fixtures";
import { readListResponse } from "./fixtures/api_list";

test.skip(!process.env.E2E_RUN, "Set E2E_RUN=1 to enable Telegram ingest e2e tests.");

test("Telegram ingestion creates posts", async () => {
  const api = await apiRequest();
  const identifier = `channel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const sourceResponse = await api.post("/telegram/sources", {
    data: { type: "telegram", identifier },
  });
  expect(sourceResponse.ok()).toBeTruthy();
  const source = await sourceResponse.json();

  const ingestResponse = await api.post("/telegram/ingest", {
    data: { source_id: source.id },
  });
  expect(ingestResponse.status()).toBe(202);

  const postsResponse = await api.get(`/telegram/posts?source_id=${source.id}&include_duplicates=true`);
  expect(postsResponse.ok()).toBeTruthy();
  const postsPayload = await postsResponse.json();
  const posts = readListResponse(postsPayload);
  expect(posts.length).toBeGreaterThan(0);
});
