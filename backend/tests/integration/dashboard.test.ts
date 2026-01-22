import { test, expect } from "bun:test";
import app from "../../src/api/routes/index";

const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!hasEnv) {
  test.skip("dashboard endpoint requires Supabase configuration", () => {});
} else {
  test("GET /dashboard/summary returns metrics", async () => {
    const response = await app.request("/dashboard/summary");
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(typeof payload.idea_count).toBe("number");
    expect(typeof payload.signal_count).toBe("number");
    expect(typeof payload.trade_count).toBe("number");
  });
}
