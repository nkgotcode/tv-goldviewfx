/**
 * Binance Worker — Main entry point for the Binance data pipeline.
 *
 * Runs as a long-lived Nomad service:
 * - WebSocket connections for spot + futures live streaming
 * - REST polling for non-WS data (sentiment endpoints) every 5 minutes
 * - Uses TIMESCALE_URL from existing secrets, plus BINANCE_API_KEY/BINANCE_SECRET_KEY
 */

import { loadEnv } from "../config/env";
import { logInfo, logWarn, logError } from "../services/logger";
import { startBinanceMarketDataWs } from "../services/binance_market_data_ws";
import { runBinanceSpotIngest } from "../services/binance_spot_ingest";
import { runBinanceFuturesIngest } from "../services/binance_futures_ingest";
import { ensureBinanceMarketDataSchema } from "../db/timescale/binance_market_data";

async function main() {
    const env = loadEnv();

    logInfo("Binance worker starting", {
        marketDataEnabled: env.BINANCE_MARKET_DATA_ENABLED,
        wsEnabled: env.BINANCE_WS_ENABLED,
        backfillEnabled: env.BINANCE_BACKFILL_ENABLED,
        restPollIntervalMs: env.BINANCE_REST_POLL_INTERVAL_MS,
    });

    if (!env.BINANCE_MARKET_DATA_ENABLED) {
        logInfo("Binance market data disabled, exiting");
        return;
    }

    // Ensure DB schema is ready
    await ensureBinanceMarketDataSchema();

    // Start WebSocket streams
    const wsController = startBinanceMarketDataWs();
    if (wsController) {
        logInfo("Binance WS started", wsController.status());
    }

    // REST polling loop for continuous data ingest
    const pollIntervalMs = env.BINANCE_REST_POLL_INTERVAL_MS;

    async function pollRest() {
        while (true) {
            try {
                logInfo("Binance REST poll starting");

                // Run spot ingest (incremental: only new data from latest DB row)
                const spotSummaries = await runBinanceSpotIngest({ maxBatches: 5 });
                const spotTotal = spotSummaries.reduce(
                    (sum, s) => sum + s.candlesInserted + s.aggTradesInserted + s.orderbookInserted + s.tickersInserted,
                    0,
                );

                // Run futures ingest (includes sentiment endpoints)
                const futuresSummaries = await runBinanceFuturesIngest({ maxBatches: 5 });
                const futuresTotal = futuresSummaries.reduce(
                    (sum, s) =>
                        sum +
                        s.candlesInserted + s.aggTradesInserted + s.orderbookInserted +
                        s.tickersInserted + s.fundingInserted + s.oiInserted +
                        s.oiStatsInserted + s.markKlinesInserted + s.indexKlinesInserted +
                        s.premiumKlinesInserted + s.lsRatioInserted + s.takerInserted + s.basisInserted,
                    0,
                );

                logInfo("Binance REST poll complete", { spotTotal, futuresTotal });
            } catch (error) {
                logWarn("Binance REST poll error", { error: String(error) });
            }

            await sleep(pollIntervalMs);
        }
    }

    // Start poll loop (don't await — it runs forever)
    pollRest().catch((error) => {
        logError("Binance REST poll fatal error", { error: String(error) });
        process.exit(1);
    });

    // Keep process alive
    logInfo("Binance worker running");
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
    console.error(`Binance worker failed: ${String(error)}`);
    process.exitCode = 1;
});
