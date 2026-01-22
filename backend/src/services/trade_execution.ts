import { loadEnv } from "../config/env";
import { insertTradeExecution } from "../db/repositories/trade_executions";
import { updateTradeMetrics } from "../db/repositories/trades";
import { getAgentConfig } from "../db/repositories/agent_config";
import { BingXExchangeAdapter } from "../integrations/exchange/bingx_client";
import { PaperExchangeAdapter } from "../integrations/exchange/paper";
import { getPromotionMetrics } from "./trade_analytics";
import { getDefaultThreshold, recordDataSourceStatus } from "./data_source_status_service";
import { logWarn } from "./logger";
import type { TradingPair } from "../types/rl";

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
};

type ExecutionStatus = "partial" | "filled" | "failed";

function normalizePair(instrument: string): TradingPair | null {
  const normalized = instrument.trim().toUpperCase();
  if (normalized === "GOLD-USDT" || normalized === "GOLDUSDT" || normalized === "GOLD") {
    return "Gold-USDT";
  }
  if (normalized === "XAUT-USDT" || normalized === "XAUTUSDT") {
    return "XAUTUSDT";
  }
  if (normalized === "PAXG-USDT" || normalized === "PAXGUSDT") {
    return "PAXGUSDT";
  }
  return null;
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
  if (trade.mode === "paper") {
    return executePaperTrade(trade);
  }
  const env = loadEnv();
  if (env.ALLOW_LIVE_SIMULATION && (!env.BINGX_API_KEY || !env.BINGX_SECRET_KEY)) {
    return executePaperTrade(trade);
  }
  return executeLiveTrade(trade);
}

export async function executePaperTrade(trade: TradeExecutionInput) {
  const adapter = new PaperExchangeAdapter();
  const result = await adapter.placeOrder({
    instrument: trade.instrument,
    side: trade.side,
    quantity: trade.quantity,
    clientOrderId: trade.client_order_id ?? undefined,
    tpPrice: trade.tp_price ?? undefined,
    slPrice: trade.sl_price ?? undefined,
  });

  const execution = await insertTradeExecution({
    trade_id: trade.id,
    trade_decision_id: trade.trade_decision_id ?? null,
    exchange_order_id: result.orderId,
    filled_quantity: trade.quantity,
    average_price: 0,
    status: "filled",
  });

  await updateTradeMetrics(trade.id, {
    position_size: trade.quantity,
    tp_price: trade.tp_price ?? null,
    sl_price: trade.sl_price ?? null,
  });
  await recordTradeSourceStatus(trade.instrument);

  return execution;
}

async function executeLiveTrade(trade: TradeExecutionInput) {
  const env = loadEnv();
  if (!env.BINGX_API_KEY || !env.BINGX_SECRET_KEY) {
    throw new Error("Missing BingX API credentials.");
  }
  if (!trade.client_order_id) {
    throw new Error("Missing client order id for live trade.");
  }

  const adapter = new BingXExchangeAdapter({
    apiKey: env.BINGX_API_KEY,
    secretKey: env.BINGX_SECRET_KEY,
    baseUrl: env.BINGX_BASE_URL,
    recvWindow: env.BINGX_RECV_WINDOW,
  });

  const result = await adapter.placeOrder({
    instrument: trade.instrument,
    side: trade.side,
    quantity: trade.quantity,
    clientOrderId: trade.client_order_id ?? undefined,
    tpPrice: trade.tp_price ?? undefined,
    slPrice: trade.sl_price ?? undefined,
  });

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

  const execution = await insertTradeExecution({
    trade_id: trade.id,
    trade_decision_id: trade.trade_decision_id ?? null,
    exchange_order_id: result.orderId,
    filled_quantity: filledQuantity,
    average_price: averagePrice,
    status,
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

  return execution;
}
