import { test, expect } from "bun:test";
import app from "../../src/api/routes/index";
import { normalizeListPayload } from "../helpers/api_list";

const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!hasEnv) {
  test.skip("ideas endpoint requires Supabase configuration", () => {});
} else {
  test("GET /ideas returns an array", async () => {
    const response = await app.request("/ideas");
    expect(response.status).toBe(200);
    const payload = await response.json();
    const items = normalizeListPayload(payload);
    expect(Array.isArray(items)).toBe(true);
  });
}
