import { test, expect } from "bun:test";
import app from "../../src/api/routes/index";
import { getOrCreateSource } from "../../src/db/repositories/sources";
import { insertIdea } from "../../src/db/repositories/ideas";
import { hashContent } from "../../src/services/dedup";

const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!hasEnv) {
  test.skip("idea review tests require Supabase configuration", () => {});
} else {
  test("idea review status can be updated", async () => {
    const source = await getOrCreateSource("tradingview", `review-${Date.now()}`, "Review Source");
    const idea = await insertIdea({
      source_id: source.id,
      external_id: `ext-${Date.now()}`,
      url: "https://example.com",
      title: "Review Idea",
      author_handle: "tester",
      content: "Idea content",
      content_hash: hashContent("Idea content"),
      published_at: new Date().toISOString(),
      dedup_status: "canonical",
    });

    const response = await app.request(`/idea-reviews/${idea.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ review_status: "approved" }),
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.review_status).toBe("approved");

    const getResponse = await app.request(`/idea-reviews/${idea.id}`);
    expect(getResponse.status).toBe(200);
    const getPayload = await getResponse.json();
    expect(getPayload.review_status).toBe("approved");
  });
}
