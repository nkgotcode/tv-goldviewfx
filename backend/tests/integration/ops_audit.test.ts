import { test, expect } from "bun:test";
import app from "../../src/api/routes/index";

const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!hasEnv) {
  test.skip("ops audit endpoints require Supabase configuration", () => {});
} else {
  test("GET /ops/audit returns log list", async () => {
    const response = await app.request("/ops/audit");
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload.data)).toBe(true);
  });
}
