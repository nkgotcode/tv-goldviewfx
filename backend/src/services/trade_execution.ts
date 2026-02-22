import { loadEnv } from "../config/env";
import { fromBingxSymbol, resolveSupportedPair } from "../config/market_catalog";
import {
  findTradeExecutionByIdempotencyKey,
  insertTradeExecution,
  listTradeExecutions,
  updateTradeExecution,
} from "../db/repositories/trade_executions";
import { getTradeById, updateTradeMetrics } from "../db/repositories/trades";
import { getAgentConfig } from "../db/repositories/agent_config";
import { insertOpsAlert } from "../db/repositories/ops_alerts";
import { BingXExchangeAdapter } from "../integrations/exchange/bingx_client";
import { PaperExchangeAdapter } from "../integrations/exchange/paper";
import { getPromotionMetrics } from "./trade_analytics";
import { getDefaultThreshold, recordDataSourceStatus } from "./data_source_status_service";
import { logWarn } from "./logger";
import { transitionExecutionStatus, transitionTradeStatus } from "./trade_state_machine";
import { enforceAccountRisk } from "./account_risk_service";
import { recordExecutionSlippage } from "./observability_service";
import { assertInstrumentAllowed } from "./instrument_policy";
import type { TradingPair } from "../types/rl";
import type { OrderDetail } from "../integrations/exchange/adapter";

type TradeExecutionInput = {
  id: string;
  instrument: string;
  side: "long" | "short";
  quantity: number;
  mode: "paper" | "live";
  trade_decision_id?: string | null;
  client_order_id?: string | null;
  tp_price?: number | null;
  sl_price?: number | null;
  idempotency_key?: string | null;
  trace_id?: string | null;
};

type ExecutionStatus = "submitted" | "partial" | "filled" | "failed" | "cancelled";

const MAX_ORDER_ID_RECOVERY_ATTEMPTS = 3;

function normalizePair(instrument: string): TradingPair | null {
  return resolveSupportedPair(instrument) ?? fromBingxSymbol(instrument) ?? null;
}

function buildClientOrderId(prefix: string) {
  const hasCrypto = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function";
  const suffix = hasCrypto ? crypto.randomUUID().split("-")[0] : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${suffix}`;
}

function buildBingxAdapter() {
  const env = loadEnv();
  if (!env.BINGX_API_KEY || !env.BINGX_SECRET_KEY) {
    throw new Error("Missing BingX API credentials.");
  }
  return new BingXExchangeAdapter({
    apiKey: env.BINGX_API_KEY,
    secretKey: env.BINGX_SECRET_KEY,
    baseUrl: env.BINGX_BASE_URL,
    recvWindow: env.BINGX_RECV_WINDOW,
  });
}

async function resolveMissingOrderId(params: {
  execution: { id: string; attempt_count?: number | null; client_order_id?: string | null };
  adapter: BingXExchangeAdapter;
  instrument: string;
  context: "execute_trade" | "reconcile" | "cancel" | "close";
}) {
  const clientOrderId = params.execution.client_order_id;
  if (!clientOrderId) {
    return null;
  }
  const attempts = Number(params.execution.attempt_count ?? 0);
  if (attempts >= MAX_ORDER_ID_RECOVERY_ATTEMPTS) {
    await updateTradeExecution(params.execution.id, {
      reconciliation_status: "error",
      reconciled_at: new Date().toISOString(),
    });
    await insertOpsAlert({
      category: "ops",
      severity: "high",
      metric: "trade_execution_order_id_unresolved",
      value: attempts,
      metadata: {
        execution_id: params.execution.id,
        client_order_id: clientOrderId,
        context: params.context,
      },
    });
    return null;
  }

  const nextAttempt = attempts + 1;
  const now = new Date().toISOString();
  let detail: OrderDetail | null = null;
  try {
    detail = await params.adapter.getOrderDetailByClientOrderId?.(clientOrderId, params.instrument) ?? null;
  } catch (error) {
    await updateTradeExecution(params.execution.id, {
      attempt_count: nextAttempt,
      last_attempt_at: now,
    });
    throw error;
  }

  if (!detail?.orderId) {
    await updateTradeExecution(params.execution.id, {
      attempt_count: nextAttempt,
      last_attempt_at: now,
    });
    return null;
  }

  await updateTradeExecution(params.execution.id, {
    exchange_order_id: detail.orderId,
    attempt_count: nextAttempt,
    last_attempt_at: now,
    reconciliation_status: "pending",
  });
  return detail;
}

async function recordTradeSourceStatus(instrument: string) {
  const pair = normalizePair(instrument);
  if (!pair) return;
  try {
    await recordDataSourceStatus({
      pair,
      sourceType: "trades",
      lastSeenAt: new Date().toISOString(),
      freshnessThresholdSeconds: getDefaultThreshold("trades"),
    });
  } catch (error) {
    logWarn("Failed to record trade source status", { error: String(error), instrument });
  }
}

function mapBingxStatus(status: string | null | undefined): ExecutionStatus {
  if (!status) return "partial";
  const normalized = status.toUpperCase();
  if (normalized === "FILLED") return "filled";
  if (normalized === "REJECTED" || normalized === "CANCELLED" || normalized === "FAILED") {
    return "failed";
  }
  return "partial";
}

function buildIdempotencyKey(trade: TradeExecutionInput) {
  if (trade.idempotency_key) {
    return trade.idempotency_key;
  }
  if (trade.trade_decision_id) {
    return `decision:${trade.trade_decision_id}`;
  }
  if (trade.client_order_id) {
    return `client:${trade.client_order_id}`;
  }
  return `trade:${trade.id}`;
}

function resolveTraceId(trade: TradeExecutionInput) {
  return trade.trace_id ?? trade.trade_decision_id ?? trade.id;
}

function assertReplaySafe(existing: any, trade: TradeExecutionInput) {
  const hasFingerprint =
    existing.requested_instrument !== undefined ||
    existing.requested_side !== undefined ||
    existing.requested_quantity !== undefined ||
    existing.execution_mode !== undefined;
  if (!hasFingerprint) {
    return;
  }
  const mismatched =
    existing.requested_instrument !== trade.instrument ||
    existing.requested_side !== trade.side ||
    Number(existing.requested_quantity ?? 0) !== trade.quantity ||
    existing.execution_mode !== trade.mode;
  if (mismatched) {
    throw new Error("Idempotency key reuse detected with mismatched execution payload.");
  }
}

export async function executeTrade(trade: TradeExecutionInput) {
  const config = await getAgentConfig();
  const killSwitch = config.kill_switch ?? false;
  if (killSwitch) {
    throw new Error("Kill switch enabled. Execution blocked.");
  }
  const promotionRequired = config.promotion_required ?? false;
  if (trade.mode === "live" && promotionRequired) {
    const metrics = await getPromotionMetrics();
    const minTrades = config.promotion_min_trades ?? 0;
    const minWinRate = config.promotion_min_win_rate ?? 0;
    const minNetPnl = config.promotion_min_net_pnl ?? 0;
    const maxDrawdown = config.promotion_max_drawdown ?? 0;
    const passesGate =
      metrics.tradeCount >= minTrades &&
      metrics.winRate >= minWinRate &&
      metrics.netPnl >= minNetPnl &&
      metrics.maxDrawdown <= maxDrawdown;
    if (!passesGate) {
      throw new Error("Promotion gate blocked live execution.");
    }
  }
  const idempotencyKey = buildIdempotencyKey(trade);
  const traceId = resolveTraceId(trade);
  const existing = await findTradeExecutionByIdempotencyKey(idempotencyKey);
  if (existing) {
    assertReplaySafe(existing, trade);
    if (!existing.exchange_order_id && trade.mode === "live") {
      try {
        const adapter = buildBingxAdapter();
        await resolveMissingOrderId({
          execution: existing,
          adapter,
          instrument: trade.instrument,
          context: "execute_trade",
        });
      } catch (error) {
        logWarn("Failed to resolve exchange order id for replay", {
          error: String(error),
          executionId: existing.id,
          tradeId: trade.id,
        });
      }
    }
    return existing;
  }

  assertInstrumentAllowed(trade.instrument, config.allowed_instruments ?? []);

  if (trade.mode === "paper") {
    return executePaperTrade(trade, idempotencyKey, traceId);
  }
  const tradeRecord = await getTradeById(trade.id);
  await enforceAccountRisk({
    instrument: trade.instrument,
    quantity: trade.quantity,
    leverage: tradeRecord.leverage ?? null,
  });
  const env = loadEnv();
  if (env.ALLOW_LIVE_SIMULATION && (!env.BINGX_API_KEY || !env.BINGX_SECRET_KEY)) {
    return executePaperTrade(trade, idempotencyKey, traceId);
  }
  return executeLiveTrade(trade, idempotencyKey, traceId);
}

export async function executePaperTrade(trade: TradeExecutionInput, idempotencyKey: string, traceId: string) {
  const adapter = new PaperExchangeAdapter();
  const submitted = await insertTradeExecution({
    trade_id: trade.id,
    trade_decision_id: trade.trade_decision_id ?? null,
    execution_kind: "entry",
    exchange_order_id: null,
    client_order_id: trade.client_order_id ?? null,
    idempotency_key: idempotencyKey,
    trace_id: traceId,
    execution_mode: trade.mode,
    requested_instrument: trade.instrument,
    requested_side: trade.side,
    requested_quantity: trade.quantity,
    filled_quantity: 0,
    average_price: 0,
    status: "submitted",
    reconciliation_status: "pending",
    attempt_count: 0,
    last_attempt_at: null,
  });

  let result: { orderId: string };
  try {
    result = await adapter.placeOrder({
      instrument: trade.instrument,
      side: trade.side,
      quantity: trade.quantity,
      clientOrderId: trade.client_order_id ?? undefined,
      tpPrice: trade.tp_price ?? undefined,
      slPrice: trade.sl_price ?? undefined,
    });
  } catch (error) {
    await transitionExecutionStatus(submitted.id, "failed", {
      reason: error instanceof Error ? error.message : "paper_execution_failed",
      patch: { reconciliation_status: "error", reconciled_at: new Date().toISOString() },
    });
    throw error;
  }

  const execution = await transitionExecutionStatus(submitted.id, "filled", {
    patch: {
      exchange_order_id: result.orderId,
      filled_quantity: trade.quantity,
      average_price: 0,
      reconciliation_status: "ok",
      reconciled_at: new Date().toISOString(),
    },
  });

  await updateTradeMetrics(trade.id, {
    position_size: trade.quantity,
    tp_price: trade.tp_price ?? null,
    sl_price: trade.sl_price ?? null,
  });
  await recordTradeSourceStatus(trade.instrument);
  if (execution.status === "filled") {
    await recordExecutionSlippage({
      tradeId: trade.id,
      executionId: execution.id,
      tradeDecisionId: execution.trade_decision_id ?? null,
      averagePrice: execution.average_price,
      traceId: execution.trace_id ?? null,
    });
  }

  return execution;
}

async function executeLiveTrade(trade: TradeExecutionInput, idempotencyKey: string, traceId: string) {
  if (!trade.client_order_id) {
    throw new Error("Missing client order id for live trade.");
  }

  const adapter = buildBingxAdapter();

  const submitted = await insertTradeExecution({
    trade_id: trade.id,
    trade_decision_id: trade.trade_decision_id ?? null,
    execution_kind: "entry",
    exchange_order_id: null,
    client_order_id: trade.client_order_id ?? null,
    idempotency_key: idempotencyKey,
    trace_id: traceId,
    execution_mode: trade.mode,
    requested_instrument: trade.instrument,
    requested_side: trade.side,
    requested_quantity: trade.quantity,
    filled_quantity: 0,
    average_price: 0,
    status: "submitted",
    reconciliation_status: "pending",
    attempt_count: 0,
    last_attempt_at: null,
  });

  let result: { orderId: string };
  try {
    result = await adapter.placeOrder({
      instrument: trade.instrument,
      side: trade.side,
      quantity: trade.quantity,
      clientOrderId: trade.client_order_id ?? undefined,
      tpPrice: trade.tp_price ?? undefined,
      slPrice: trade.sl_price ?? undefined,
    });
  } catch (error) {
    await transitionExecutionStatus(submitted.id, "failed", {
      reason: error instanceof Error ? error.message : "live_execution_failed",
      patch: { reconciliation_status: "error", reconciled_at: new Date().toISOString() },
    });
    throw error;
  }

  let status: ExecutionStatus = "partial";
  let filledQuantity = 0;
  let averagePrice = 0;
  let pnl: number | null = null;
  let tpPrice: number | null = trade.tp_price ?? null;
  let slPrice: number | null = trade.sl_price ?? null;
  let pnlPct: number | null = null;

  try {
    const detail = await adapter.getOrderDetail(result.orderId, trade.instrument);
    status = mapBingxStatus(detail.status);
    filledQuantity = detail.executedQty ?? 0;
    averagePrice = detail.avgPrice ?? 0;
    pnl = detail.profit ?? null;
    if (pnl !== null && averagePrice > 0 && filledQuantity > 0) {
      pnlPct = (pnl / (averagePrice * filledQuantity)) * 100;
    }
    tpPrice = detail.tpPrice ?? tpPrice;
    slPrice = detail.slPrice ?? slPrice;
  } catch {
    status = "partial";
  }

  const execution = await transitionExecutionStatus(submitted.id, status, {
    patch: {
      exchange_order_id: result.orderId,
      filled_quantity: filledQuantity,
      average_price: averagePrice,
      reconciliation_status: status === "filled" ? "ok" : "pending",
      reconciled_at: status === "filled" ? new Date().toISOString() : null,
    },
  });

  await updateTradeMetrics(trade.id, {
    position_size: filledQuantity > 0 ? filledQuantity : null,
    avg_fill_price: averagePrice > 0 ? averagePrice : null,
    pnl,
    pnl_pct: pnlPct,
    tp_price: tpPrice,
    sl_price: slPrice,
  });
  await recordTradeSourceStatus(trade.instrument);
  if (execution.status === "filled") {
    await recordExecutionSlippage({
      tradeId: trade.id,
      executionId: execution.id,
      tradeDecisionId: execution.trade_decision_id ?? null,
      averagePrice: averagePrice,
      traceId: execution.trace_id ?? null,
    });
  }

  return execution;
}

export async function cancelTradeExecution(tradeId: string, options?: { reason?: string | null }) {
  const trade = await getTradeById(tradeId);
  if (!["placed", "partial"].includes(trade.status)) {
    throw new Error("Trade is not open for cancellation.");
  }
  const executions = await listTradeExecutions(tradeId);
  const execution = executions[0];
  if (!execution) {
    throw new Error("No trade execution available to cancel.");
  }
  if (execution.status === "filled" || execution.status === "failed" || execution.status === "cancelled") {
    throw new Error("Trade execution is not cancellable.");
  }

  const reason = options?.reason ?? "manual_cancel";
  const filledQuantity = Number(execution.filled_quantity ?? 0);

  if (trade.mode === "paper") {
    const updatedExecution = await transitionExecutionStatus(execution.id, "cancelled", {
      reason,
      patch: {
        reconciliation_status: "ok",
        reconciled_at: new Date().toISOString(),
        execution_kind: execution.execution_kind ?? "entry",
      },
    });
    await updateTradeMetrics(trade.id, { position_size: filledQuantity });
    if (filledQuantity > 0) {
      await transitionTradeStatus(trade.id, "partial", { reason });
    } else {
      await transitionTradeStatus(trade.id, "cancelled", { reason });
    }
    return { trade: await getTradeById(trade.id), execution: updatedExecution };
  }

  const adapter = buildBingxAdapter();
  let exchangeOrderId = execution.exchange_order_id;
  if (!exchangeOrderId) {
    const detail = await resolveMissingOrderId({
      execution,
      adapter,
      instrument: trade.instrument,
      context: "cancel",
    });
    exchangeOrderId = detail?.orderId ?? null;
  }
  if (!exchangeOrderId) {
    throw new Error("Unable to resolve exchange order id for cancellation.");
  }

  await adapter.cancelOrder({
    orderId: exchangeOrderId,
    clientOrderId: execution.client_order_id ?? undefined,
    instrument: trade.instrument,
  });

  const updatedExecution = await transitionExecutionStatus(execution.id, "cancelled", {
    reason,
    patch: {
      reconciliation_status: "ok",
      reconciled_at: new Date().toISOString(),
      execution_kind: execution.execution_kind ?? "entry",
    },
  });
  await updateTradeMetrics(trade.id, { position_size: filledQuantity });
  if (filledQuantity > 0) {
    await transitionTradeStatus(trade.id, "partial", { reason });
  } else {
    await transitionTradeStatus(trade.id, "cancelled", { reason });
  }

  return { trade: await getTradeById(trade.id), execution: updatedExecution };
}

export async function closeTradePosition(params: {
  tradeId: string;
  quantity?: number;
  clientOrderId?: string;
  reason?: string | null;
}) {
  const trade = await getTradeById(params.tradeId);
  if (!["filled", "partial"].includes(trade.status)) {
    throw new Error("Trade is not open for closing.");
  }

  const currentSize = Number(trade.position_size ?? trade.quantity ?? 0);
  if (currentSize <= 0) {
    throw new Error("No open position size available to close.");
  }
  const closeQuantity = params.quantity ? Math.min(params.quantity, currentSize) : currentSize;
  if (closeQuantity <= 0) {
    throw new Error("Close quantity must be positive.");
  }

  const reason = params.reason ?? "manual_close";
  const closeSide = trade.side === "long" ? "short" : "long";
  const clientOrderId = params.clientOrderId ?? buildClientOrderId("gvfx-close");
  const traceId = buildClientOrderId("trace");

  const submitted = await insertTradeExecution({
    trade_id: trade.id,
    trade_decision_id: null,
    execution_kind: "exit",
    exchange_order_id: null,
    client_order_id: clientOrderId,
    idempotency_key: `close:${trade.id}:${clientOrderId}`,
    trace_id: traceId,
    execution_mode: trade.mode,
    requested_instrument: trade.instrument,
    requested_side: closeSide,
    requested_quantity: closeQuantity,
    filled_quantity: 0,
    average_price: 0,
    status: "submitted",
    reconciliation_status: "pending",
    attempt_count: 0,
    last_attempt_at: null,
  });

  if (trade.mode === "paper") {
    const updatedExecution = await transitionExecutionStatus(submitted.id, "filled", {
      reason,
      patch: {
        exchange_order_id: `paper-close-${Date.now()}`,
        filled_quantity: closeQuantity,
        average_price: 0,
        reconciliation_status: "ok",
        reconciled_at: new Date().toISOString(),
      },
    });
    const nextSize = Math.max(0, currentSize - closeQuantity);
    await updateTradeMetrics(trade.id, {
      position_size: nextSize,
      closed_at: nextSize <= 0 ? new Date().toISOString() : null,
    });
    return { trade: await getTradeById(trade.id), execution: updatedExecution };
  }

  const adapter = buildBingxAdapter();
  let result: { orderId: string };
  try {
    result = await adapter.placeOrder({
      instrument: trade.instrument,
      side: closeSide,
      quantity: closeQuantity,
      clientOrderId,
      reduceOnly: true,
    });
  } catch (error) {
    await transitionExecutionStatus(submitted.id, "failed", {
      reason: error instanceof Error ? error.message : "close_execution_failed",
      patch: { reconciliation_status: "error", reconciled_at: new Date().toISOString() },
    });
    throw error;
  }

  let status: ExecutionStatus = "partial";
  let filledQuantity = 0;
  let averagePrice = 0;
  let pnl: number | null = null;
  let pnlPct: number | null = null;

  try {
    const detail = await adapter.getOrderDetail(result.orderId, trade.instrument);
    status = mapBingxStatus(detail.status);
    filledQuantity = detail.executedQty ?? 0;
    averagePrice = detail.avgPrice ?? 0;
    pnl = detail.profit ?? null;
    if (pnl !== null && averagePrice > 0 && filledQuantity > 0) {
      pnlPct = (pnl / (averagePrice * filledQuantity)) * 100;
    }
  } catch {
    status = "partial";
  }

  const updatedExecution = await transitionExecutionStatus(submitted.id, status, {
    patch: {
      exchange_order_id: result.orderId,
      filled_quantity: filledQuantity,
      average_price: averagePrice,
      reconciliation_status: status === "filled" ? "ok" : "pending",
      reconciled_at: status === "filled" ? new Date().toISOString() : null,
    },
  });

  const nextSize = Math.max(0, currentSize - filledQuantity);
  await updateTradeMetrics(trade.id, {
    position_size: nextSize,
    pnl,
    pnl_pct: pnlPct,
    closed_at: nextSize <= 0 ? new Date().toISOString() : null,
  });

  return { trade: await getTradeById(trade.id), execution: updatedExecution };
}
