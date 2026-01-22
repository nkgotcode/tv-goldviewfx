import { test, expect } from "bun:test";
import app from "../../src/api/routes/index";

const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!hasEnv) {
  test.skip("rbac tests require Supabase configuration", () => {});
} else {
  test("analyst role cannot update agent config", async () => {
    const response = await app.request("/agent/config", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-ops-role": "analyst",
      },
      body: JSON.stringify({ enabled: true }),
    });
    expect(response.status).toBe(403);
  });

  test("analyst role cannot update ingestion config", async () => {
    const response = await app.request("/ops/ingestion/config", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-ops-role": "analyst",
      },
      body: JSON.stringify({
        source_type: "tradingview",
        enabled: true,
      }),
    });
    expect(response.status).toBe(403);
  });
}
