import { test, expect } from "bun:test";
import app from "../../src/api/routes/index";

const hasEnv = process.env.CONVEX_TEST_ENABLED === "true";

if (!hasEnv) {
  test.skip("rbac tests require Convex configuration", () => {});
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

  test("analyst role cannot reconcile trades", async () => {
    const response = await app.request("/ops/trading/reconcile", {
      method: "POST",
      headers: {
        "x-ops-role": "analyst",
      },
    });
    expect(response.status).toBe(403);
  });

  test("api token ignores role overrides", async () => {
    const previousToken = process.env.API_TOKEN;
    process.env.API_TOKEN = "test-token";
    try {
      const response = await app.request("/agent/config", {
        method: "PUT",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
          "x-ops-role": "analyst",
        },
        body: JSON.stringify({ enabled: true }),
      });
      expect(response.status).toBe(200);
    } finally {
      if (previousToken) {
        process.env.API_TOKEN = previousToken;
      } else {
        delete process.env.API_TOKEN;
      }
    }
  });
}
