import { loadEnv } from "../src/config/env";
import { runBingxFullBackfillIfNeeded } from "../src/services/bingx_full_backfill_service";
import { logInfo } from "../src/services/logger";

async function main() {
  loadEnv();
  const result = await runBingxFullBackfillIfNeeded({ source: "nomad_periodic" });
  logInfo("BingX full backfill job finished", {
    ran: result.ran,
    reason: result.decision.reason,
    open_gaps: result.decision.openGapCount,
    non_ok_sources: result.decision.nonOkSourceCount,
    inserted: result.totalInserted,
  });
}

main().catch((error) => {
  console.error(`BingX full backfill job failed: ${String(error)}`);
  process.exitCode = 1;
});
