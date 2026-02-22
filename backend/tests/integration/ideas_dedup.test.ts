import { test, expect } from "bun:test";
import { fileURLToPath } from "url";
import { runTradingViewSync } from "../../src/services/tradingview_sync";
import { convex } from "../../src/db/client";

const hasEnv = process.env.CONVEX_TEST_ENABLED === "true";
const htmlPath = fileURLToPath(new URL("../../../tradingview.html", import.meta.url));

async function cleanup(identifier: string) {
  const sources = await convex.from("sources").select("id").eq("identifier", identifier);
  if (sources.data) {
    for (const source of sources.data) {
      await convex.from("sources").delete().eq("id", source.id);
    }
  }
}

if (!hasEnv) {
  test.skip("dedup integration requires Convex configuration", () => {});
} else {
  test("sync is idempotent and does not create duplicates", async () => {
    process.env.TRADINGVIEW_HTML_PATH = htmlPath;
    process.env.TRADINGVIEW_USE_HTML = "true";
    await cleanup(htmlPath);

    const first = await runTradingViewSync({ trigger: "manual", fetchFull: false });
    const second = await runTradingViewSync({ trigger: "manual", fetchFull: false });

    expect(first.newCount).toBeGreaterThanOrEqual(0);
    expect(second.newCount).toBe(0);
  });
}
