import { test, expect } from "bun:test";
import { fileURLToPath } from "url";
import { runTradingViewSync } from "../../src/services/tradingview_sync";
import { supabase } from "../../src/db/client";

const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const htmlPath = fileURLToPath(new URL("../../../tradingview.html", import.meta.url));

async function cleanup(identifier: string) {
  const sources = await supabase.from("sources").select("id").eq("identifier", identifier);
  if (sources.data) {
    for (const source of sources.data) {
      await supabase.from("sources").delete().eq("id", source.id);
    }
  }
}

if (!hasEnv) {
  test.skip("dedup integration requires Supabase configuration", () => {});
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
