import { test, expect } from "bun:test";
import { fileURLToPath } from "url";
import app from "../../src/api/routes/index";

const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const htmlPath = fileURLToPath(new URL("../../../tradingview.html", import.meta.url));

if (!hasEnv) {
  test.skip("sync endpoint requires Supabase configuration", () => {});
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
