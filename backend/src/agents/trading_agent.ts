import { getAgentConfig, updateAgentConfig } from "../db/repositories/agent_config";
import { listRecentSignals } from "../db/repositories/signals";
import { insertTrade } from "../db/repositories/trades";
import { executeTrade } from "../services/trade_execution";
import { evaluateTrade } from "../services/risk_engine";
import { auditTrade } from "../services/trade_audit";
import { evaluateSourcePolicy } from "../services/source_policy_service";
import { getPromotionMetrics } from "../services/trade_analytics";
import { transitionTradeStatus } from "../services/trade_state_machine";

const DEFAULT_INSTRUMENT = "GOLD-USDT";

export async function runTradingAgentOnce() {
  const config = await getAgentConfig();
  if (!config.enabled) {
    return { status: "disabled", executed: 0, rejected: 0 };
  }

  const signals = await listRecentSignals(5);
  let executed = 0;
  let rejected = 0;

  for (const signal of signals) {
    if (config.mode === "live" && config.promotion_required) {
      const minTrades = config.promotion_min_trades ?? 0;
      const minWinRate = config.promotion_min_win_rate ?? 0;
      const minNetPnl = config.promotion_min_net_pnl ?? 0;
      const maxDrawdown = config.promotion_max_drawdown ?? 0;
      const metrics = await getPromotionMetrics();
      const passesGate =
        metrics.tradeCount >= minTrades &&
        metrics.winRate >= minWinRate &&
        metrics.netPnl >= minNetPnl &&
        metrics.maxDrawdown <= maxDrawdown;
      if (!passesGate) {
        await insertTrade({
          signal_id: signal.id,
          agent_config_id: config.id,
          instrument: DEFAULT_INSTRUMENT,
          side: "long",
          quantity: config.max_position_size,
          status: "rejected",
          mode: config.mode,
        });
        rejected += 1;
        auditTrade("rejected", { signal_id: signal.id, reason: "promotion_gate" });
        continue;
      }
    }

    const sourceDecision = await evaluateSourcePolicy({
      signalId: signal.id,
      minConfidenceScore: config.min_confidence_score,
      allowedSourceIds: config.allowed_source_ids,
    });
    if (!sourceDecision.allowed) {
      await insertTrade({
        signal_id: signal.id,
        agent_config_id: config.id,
        instrument: DEFAULT_INSTRUMENT,
        side: "long",
        quantity: config.max_position_size,
        status: "rejected",
        mode: config.mode,
      });
      rejected += 1;
      auditTrade("rejected", { signal_id: signal.id, reason: sourceDecision.reason });
      continue;
    }

    const quantity = config.max_position_size;
    const decision = evaluateTrade(config, quantity);

    if (!decision.allowed) {
      await insertTrade({
        signal_id: signal.id,
        agent_config_id: config.id,
        instrument: DEFAULT_INSTRUMENT,
        side: "long",
        quantity,
        status: "rejected",
        mode: config.mode,
      });
      rejected += 1;
      auditTrade("rejected", { signal_id: signal.id, reason: decision.reason });
      continue;
    }

    const trade = await insertTrade({
      signal_id: signal.id,
      agent_config_id: config.id,
      instrument: DEFAULT_INSTRUMENT,
      side: "long",
      quantity,
      status: "placed",
      mode: config.mode,
      client_order_id: `gvfx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });

    try {
      const execution = await executeTrade({
        id: trade.id,
        quantity,
        instrument: DEFAULT_INSTRUMENT,
        side: "long",
        mode: config.mode,
        client_order_id: trade.client_order_id ?? null,
        tp_price: trade.tp_price ?? null,
        sl_price: trade.sl_price ?? null,
      });

      if (execution.status === "filled") {
        await transitionTradeStatus(trade.id, "filled");
        executed += 1;
        auditTrade("filled", { trade_id: trade.id });
      } else if (execution.status === "failed") {
        await transitionTradeStatus(trade.id, "rejected");
        rejected += 1;
        auditTrade("rejected", { trade_id: trade.id, reason: "execution_failed" });
      } else if (execution.status === "partial") {
        await transitionTradeStatus(trade.id, "partial");
      }
    } catch (error) {
      await transitionTradeStatus(trade.id, "rejected", {
        reason: error instanceof Error ? error.message : "execution_failed",
      });
      rejected += 1;
      auditTrade("rejected", {
        trade_id: trade.id,
        reason: error instanceof Error ? error.message : "execution_failed",
      });
    }
  }

  return { status: "ok", executed, rejected };
}

export async function enableTradingAgent() {
  const config = await updateAgentConfig({ enabled: true });
  const runResult = await runTradingAgentOnce();
  return { config, runResult };
}

export async function disableTradingAgent() {
  const config = await updateAgentConfig({ enabled: false });
  return { config };
}
