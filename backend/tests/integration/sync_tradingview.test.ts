import { test, expect } from "bun:test";
import { fileURLToPath } from "url";
import app from "../../src/api/routes/index";

const hasEnv = process.env.CONVEX_TEST_ENABLED === "true";

const htmlPath = fileURLToPath(new URL("../../../tradingview.html", import.meta.url));

if (!hasEnv) {
  test.skip("sync endpoint requires Convex configuration", () => {});
} else {
  test("POST /sync/tradingview triggers a sync run", async () => {
    process.env.TRADINGVIEW_HTML_PATH = htmlPath;
    process.env.TRADINGVIEW_USE_HTML = "true";

    const response = await app.request("/sync/tradingview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ full_content: false }),
    });

    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload.runId).toBeDefined();
  });
}
