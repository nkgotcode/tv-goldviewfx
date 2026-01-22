import { runTradingViewSync } from "../services/tradingview_sync";

export async function runTradingViewSyncJob() {
  return runTradingViewSync({ trigger: "schedule" });
}
