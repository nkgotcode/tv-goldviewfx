import { loadEnv } from "../config/env";
import { runBingxMarketDataIngest } from "../services/bingx_market_data_ingest";
import { enqueueRetry } from "../services/retry_queue_service";
import { logWarn } from "../services/logger";

export async function runBingxMarketDataJob() {
  const env = loadEnv();
  try {
    return await runBingxMarketDataIngest({ backfill: env.BINGX_MARKET_DATA_BACKFILL, trigger: "schedule" });
  } catch (error) {
    await enqueueRetry({
      jobType: "bingx_market_data",
      payload: { backfill: env.BINGX_MARKET_DATA_BACKFILL },
      dedupeKey: "bingx_market_data:schedule",
      error: error instanceof Error ? error.message : "bingx_market_data_failed",
    });
    logWarn("BingX market data scheduled retry", { error: String(error) });
    throw error;
  }
}
