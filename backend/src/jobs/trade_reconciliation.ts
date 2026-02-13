import { reconcileTradeExecutions } from "../services/trade_reconciliation";

export async function runTradeReconciliationJob() {
  await reconcileTradeExecutions();
}
