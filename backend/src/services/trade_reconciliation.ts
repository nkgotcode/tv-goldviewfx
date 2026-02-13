import { loadEnv } from "../config/env";
import { getTradeById, updateTradeMetrics } from "../db/repositories/trades";
import { listPendingTradeExecutions, updateTradeExecution } from "../db/repositories/trade_executions";
import { insertOpsAlert } from "../db/repositories/ops_alerts";
import { BingXExchangeAdapter } from "../integrations/exchange/bingx_client";
import { logInfo, logWarn } from "./logger";
import { transitionExecutionStatus, transitionTradeStatus } from "./trade_state_machine";
import { recordOpsAudit } from "./ops_audit";
import { recordExecutionSlippage } from "./observability_service";

type ReconcileResult = {
  checked: number;
  updated: number;
  errors: number;
};

type ExecutionStatus = "submitted" | "partial" | "filled" | "failed" | "cancelled";

const MAX_ORDER_ID_RECOVERY_ATTEMPTS = 3;

function mapBingxStatus(status: string | null | undefined): ExecutionStatus {
  if (!status) return "partial";
  const normalized = status.toUpperCase();
  if (normalized === "FILLED") return "filled";
  if (normalized === "REJECTED" || normalized === "CANCELLED" || normalized === "FAILED") {
    return "failed";
  }
  return "partial";
}

export async function reconcileTradeExecutions(options?: { limit?: number }): Promise<ReconcileResult> {
  const pending = await listPendingTradeExecutions({ limit: options?.limit });
  let updated = 0;
  let errors = 0;

  for (const execution of pending) {
    try {
      const trade = await getTradeById(execution.trade_id);
      const mode = execution.execution_mode ?? trade.mode;

      if (!execution.exchange_order_id) {
        if (mode === "paper") {
          await transitionExecutionStatus(execution.id, execution.status as ExecutionStatus, {
            reason: "missing_exchange_order_id",
            patch: {
              reconciliation_status: "error",
              reconciled_at: new Date().toISOString(),
            },
          });
          errors += 1;
          continue;
        }
        if (!execution.client_order_id) {
          await transitionExecutionStatus(execution.id, execution.status as ExecutionStatus, {
            reason: "missing_client_order_id",
            patch: {
              reconciliation_status: "error",
              reconciled_at: new Date().toISOString(),
            },
          });
          await insertOpsAlert({
            category: "ops",
            severity: "high",
            metric: "trade_execution_missing_order_id",
            value: 1,
            metadata: { execution_id: execution.id, trade_id: trade.id, instrument: trade.instrument },
          });
          errors += 1;
          continue;
        }
      }

      if (mode === "paper") {
        const filledQuantity = execution.requested_quantity ?? trade.quantity;
        await transitionExecutionStatus(execution.id, "filled", {
          reason: "paper_reconcile",
          patch: {
            filled_quantity: filledQuantity,
            average_price: execution.average_price ?? 0,
            reconciliation_status: "ok",
            reconciled_at: new Date().toISOString(),
          },
        });
        await updateTradeMetrics(trade.id, {
          position_size: filledQuantity,
        });
        await transitionTradeStatus(trade.id, "filled", { reason: "paper_reconcile" });
        await recordExecutionSlippage({
          tradeId: trade.id,
          executionId: execution.id,
          tradeDecisionId: execution.trade_decision_id ?? null,
          averagePrice: execution.average_price ?? 0,
          traceId: execution.trace_id ?? null,
        });
        await recordOpsAudit({
          actor: "system",
          action: "trade_reconciliation",
          resource_type: "trade_execution",
          resource_id: execution.id,
          metadata: { status: "filled", mode },
        });
        updated += 1;
        continue;
      }

      const env = loadEnv();
      if (!env.BINGX_API_KEY || !env.BINGX_SECRET_KEY) {
        await transitionExecutionStatus(execution.id, execution.status as ExecutionStatus, {
          reason: "missing_bingx_credentials",
          patch: {
            reconciliation_status: "error",
            reconciled_at: new Date().toISOString(),
          },
        });
        errors += 1;
        continue;
      }

      const adapter = new BingXExchangeAdapter({
        apiKey: env.BINGX_API_KEY,
        secretKey: env.BINGX_SECRET_KEY,
        baseUrl: env.BINGX_BASE_URL,
        recvWindow: env.BINGX_RECV_WINDOW,
      });

      let detail: Awaited<ReturnType<typeof adapter.getOrderDetail>> | null = null;
      let exchangeOrderId = execution.exchange_order_id ?? null;
      if (!exchangeOrderId) {
        const attempts = Number(execution.attempt_count ?? 0);
        if (attempts >= MAX_ORDER_ID_RECOVERY_ATTEMPTS) {
          await transitionExecutionStatus(execution.id, execution.status as ExecutionStatus, {
            reason: "exchange_order_id_unresolved",
            patch: {
              reconciliation_status: "error",
              reconciled_at: new Date().toISOString(),
            },
          });
          await insertOpsAlert({
            category: "ops",
            severity: "high",
            metric: "trade_execution_order_id_unresolved",
            value: attempts,
            metadata: { execution_id: execution.id, trade_id: trade.id, instrument: trade.instrument },
          });
          errors += 1;
          continue;
        }

        const nextAttempt = attempts + 1;
        const now = new Date().toISOString();
        try {
          detail = await adapter.getOrderDetailByClientOrderId?.(execution.client_order_id ?? "", trade.instrument) ?? null;
        } catch (error) {
          await updateTradeExecution(execution.id, { attempt_count: nextAttempt, last_attempt_at: now });
          errors += 1;
          logWarn("Trade reconciliation failed to resolve order id", {
            error: String(error),
            executionId: execution.id,
            clientOrderId: execution.client_order_id,
          });
          continue;
        }

        if (!detail?.orderId) {
          await updateTradeExecution(execution.id, { attempt_count: nextAttempt, last_attempt_at: now });
          continue;
        }

        exchangeOrderId = detail.orderId;
        await updateTradeExecution(execution.id, {
          exchange_order_id: detail.orderId,
          attempt_count: nextAttempt,
          last_attempt_at: now,
          reconciliation_status: "pending",
        });
      }

      if (!exchangeOrderId) {
        continue;
      }

      if (!detail) {
        detail = await adapter.getOrderDetail(exchangeOrderId, trade.instrument);
      }
      const status = mapBingxStatus(detail.status);
      const filledQuantity = detail.executedQty ?? execution.filled_quantity ?? 0;
      const averagePrice = detail.avgPrice ?? execution.average_price ?? 0;
      const pnl = detail.profit ?? null;
      let pnlPct: number | null = null;
      if (pnl !== null && averagePrice > 0 && filledQuantity > 0) {
        pnlPct = (pnl / (averagePrice * filledQuantity)) * 100;
      }

      await transitionExecutionStatus(execution.id, status, {
        patch: {
          filled_quantity: filledQuantity,
          average_price: averagePrice,
          reconciliation_status: status === "filled" ? "ok" : "pending",
          reconciled_at: new Date().toISOString(),
        },
      });

      await updateTradeMetrics(trade.id, {
        position_size: filledQuantity > 0 ? filledQuantity : null,
        avg_fill_price: averagePrice > 0 ? averagePrice : null,
        pnl,
        pnl_pct: pnlPct,
      });

      if (status === "filled") {
        await transitionTradeStatus(trade.id, "filled", { reason: "reconcile" });
        await recordExecutionSlippage({
          tradeId: trade.id,
          executionId: execution.id,
          tradeDecisionId: execution.trade_decision_id ?? null,
          averagePrice: averagePrice,
          traceId: execution.trace_id ?? null,
        });
      } else if (status === "failed") {
        await transitionTradeStatus(trade.id, "rejected", { reason: "reconcile" });
      } else if (status === "partial") {
        await transitionTradeStatus(trade.id, "partial", { reason: "reconcile" });
      }

      await recordOpsAudit({
        actor: "system",
        action: "trade_reconciliation",
        resource_type: "trade_execution",
        resource_id: execution.id,
        metadata: { status, mode, filledQuantity, averagePrice },
      });

      updated += 1;
    } catch (error) {
      errors += 1;
      logWarn("Trade reconciliation failed", { error: String(error), executionId: execution.id });
    }
  }

  logInfo("Trade reconciliation complete", { checked: pending.length, updated, errors });
  return { checked: pending.length, updated, errors };
}
