import { test, expect } from "bun:test";
import { fileURLToPath } from "node:url";
import app from "../../src/api/routes/index";
import { normalizeListPayload } from "../helpers/api_list";

const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const baseFixture = fileURLToPath(new URL("../fixtures/telegram_messages.json", import.meta.url));
const editFixture = fileURLToPath(new URL("../fixtures/telegram_messages_edit.json", import.meta.url));

if (!hasEnv) {
  test.skip("telegram dedup requires Supabase configuration", () => {});
} else {
  test("telegram ingestion deduplicates and handles edits/removals", async () => {
    process.env.TELEGRAM_MESSAGES_PATH = baseFixture;
    const identifier = `channel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sourceResponse = await app.request("/telegram/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "telegram", identifier }),
    });
    const source = await sourceResponse.json();

    await app.request("/telegram/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source_id: source.id }),
    });

    const postsResponse = await app.request(`/telegram/posts?source_id=${source.id}&include_duplicates=true`);
    expect(postsResponse.status).toBe(200);
    const postsPayload = await postsResponse.json();
    const posts = normalizeListPayload(postsPayload);
    expect(posts.length).toBeGreaterThanOrEqual(3);
    expect(posts.some((post: { dedup_status: string }) => post.dedup_status === "duplicate")).toBe(true);

    process.env.TELEGRAM_MESSAGES_PATH = editFixture;
    await app.request("/telegram/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source_id: source.id }),
    });

    const updatedResponse = await app.request(`/telegram/posts?source_id=${source.id}&include_duplicates=true`);
    const updatedPayload = await updatedResponse.json();
    const updatedPosts = normalizeListPayload(updatedPayload);
    const edited = updatedPosts.find((post: { external_id: string; status: string }) => post.external_id === "1002");
    const removed = updatedPosts.find((post: { external_id: string; status: string }) => post.external_id === "1004");
    expect(edited?.status).toBe("edited");
    expect(removed?.status).toBe("removed");
  });
}
