/**
 * Binance Full Backfill Script
 *
 * Called periodically by the Nomad batch job `gvfx-binance-backfill`.
 * Runs the full backfill orchestrator and exits.
 */

import { loadEnv } from "../src/config/env";
import { ensureBinanceMarketDataSchema } from "../src/db/timescale/binance_market_data";
import { runBinanceFullBackfill } from "../src/services/binance_full_backfill_service";
import { logInfo, logError } from "../src/services/logger";

async function main() {
    loadEnv();

    logInfo("Binance full backfill starting");

    await ensureBinanceMarketDataSchema();

    const result = await runBinanceFullBackfill({
        maxBatches: Number(process.env.BINANCE_BACKFILL_MAX_BATCHES) || 50000,
    });

    logInfo("Binance full backfill finished", {
        totalBatches: result.totalBatches,
        totalRowsInserted: result.totalRowsInserted,
        errorCount: result.errors.length,
        errors: result.errors.slice(0, 10),
    });
}

main().catch((error) => {
    logError("Binance full backfill job failed", { error: String(error) });
    console.error(`Binance backfill failed: ${String(error)}`);
    process.exitCode = 1;
});
