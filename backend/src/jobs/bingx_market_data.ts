import { loadEnv } from "../config/env";
import { runBingxMarketDataIngest } from "../services/bingx_market_data_ingest";

export async function runBingxMarketDataJob() {
  const env = loadEnv();
  return runBingxMarketDataIngest({ backfill: env.BINGX_MARKET_DATA_BACKFILL, trigger: "schedule" });
}
