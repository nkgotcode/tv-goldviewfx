import { test, expect } from "bun:test";
import app from "../../src/api/routes/index";

const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!hasEnv) {
  test.skip("telegram sources endpoints require Supabase configuration", () => {});
} else {
  test("POST /telegram/sources creates a source", async () => {
    const identifier = `channel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const response = await app.request("/telegram/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "telegram",
        identifier,
        display_name: "Test Channel",
      }),
    });
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.id).toBeTruthy();
    expect(payload.type).toBe("telegram");
    expect(payload.identifier).toBe(identifier);
  });

  test("GET /telegram/sources lists sources", async () => {
    const response = await app.request("/telegram/sources");
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload)).toBe(true);
  });
}
