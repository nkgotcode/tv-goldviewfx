import { runTradingViewSync } from "../services/tradingview_sync";
import { enqueueRetry } from "../services/retry_queue_service";
import { logWarn } from "../services/logger";

export async function runTradingViewSyncJob() {
  try {
    return await runTradingViewSync({ trigger: "schedule" });
  } catch (error) {
    await enqueueRetry({
      jobType: "tradingview_sync",
      payload: { trigger: "schedule" },
      dedupeKey: "tradingview_sync:schedule",
      error: error instanceof Error ? error.message : "tradingview_sync_failed",
    });
    logWarn("TradingView sync scheduled retry", { error: String(error) });
    throw error;
  }
}
