import { test, expect } from "bun:test";
import { insertTrade } from "../../src/db/repositories/trades";
import { getAgentConfig, updateAgentConfig } from "../../src/db/repositories/agent_config";
import {
  insertTradeExecution,
  listTradeExecutions,
} from "../../src/db/repositories/trade_executions";
import { executeTrade } from "../../src/services/trade_execution";
import { transitionTradeStatus } from "../../src/services/trade_state_machine";
import { reconcileTradeExecutions } from "../../src/services/trade_reconciliation";

const hasEnv = process.env.DB_TEST_ENABLED === "true";

if (!hasEnv) {
  test.skip("trade execution integrity requires database configuration", () => {});
} else {
  test("executeTrade enforces idempotency keys", async () => {
    await updateAgentConfig({ enabled: true, kill_switch: false, mode: "paper" });

    const trade = await insertTrade({
      signal_id: null,
      agent_config_id: null,
      instrument: "GOLD-USDT",
      side: "long",
      quantity: 1,
      status: "placed",
      mode: "paper",
      client_order_id: `gvfx-test-${Date.now()}`,
    });

    const idempotencyKey = `test-idempotency-${Date.now()}`;
    const first = await executeTrade({
      id: trade.id,
      instrument: trade.instrument,
      side: trade.side,
      quantity: trade.quantity,
      mode: trade.mode,
      client_order_id: trade.client_order_id,
      idempotency_key: idempotencyKey,
    });

    const second = await executeTrade({
      id: trade.id,
      instrument: trade.instrument,
      side: trade.side,
      quantity: trade.quantity,
      mode: trade.mode,
      client_order_id: trade.client_order_id,
      idempotency_key: idempotencyKey,
    });

    expect(first.id).toBe(second.id);

    const executions = await listTradeExecutions(trade.id);
    expect(executions.length).toBe(1);
  });

  test("executeTrade blocks replay mismatches", async () => {
    await updateAgentConfig({ enabled: true, kill_switch: false, mode: "paper" });

    const trade = await insertTrade({
      signal_id: null,
      agent_config_id: null,
      instrument: "GOLD-USDT",
      side: "long",
      quantity: 1,
      status: "placed",
      mode: "paper",
      client_order_id: `gvfx-test-${Date.now()}`,
    });

    await executeTrade({
      id: trade.id,
      instrument: trade.instrument,
      side: trade.side,
      quantity: trade.quantity,
      mode: trade.mode,
      client_order_id: trade.client_order_id,
      idempotency_key: "test-idempotency-2",
    });

    await expect(
      executeTrade({
        id: trade.id,
        instrument: trade.instrument,
        side: trade.side,
        quantity: trade.quantity + 1,
        mode: trade.mode,
        client_order_id: trade.client_order_id,
        idempotency_key: "test-idempotency-2",
      }),
    ).rejects.toThrow("Idempotency key reuse detected");
  });

  test("trade state machine rejects invalid transitions", async () => {
    const trade = await insertTrade({
      signal_id: null,
      agent_config_id: null,
      instrument: "GOLD-USDT",
      side: "long",
      quantity: 1,
      status: "filled",
      mode: "paper",
    });

    await expect(transitionTradeStatus(trade.id, "placed")).rejects.toThrow("Invalid trade status");
  });

  test("reconciliation completes paper executions", async () => {
    const trade = await insertTrade({
      signal_id: null,
      agent_config_id: null,
      instrument: "GOLD-USDT",
      side: "long",
      quantity: 2,
      status: "placed",
      mode: "paper",
    });

    await insertTradeExecution({
      trade_id: trade.id,
      trade_decision_id: null,
      exchange_order_id: "paper-123",
      execution_mode: "paper",
      requested_instrument: trade.instrument,
      requested_side: trade.side,
      requested_quantity: trade.quantity,
      filled_quantity: 0,
      average_price: 0,
      status: "partial",
      reconciliation_status: "pending",
    });

    const result = await reconcileTradeExecutions({ limit: 10 });
    expect(result.checked).toBeGreaterThan(0);

    const executions = await listTradeExecutions(trade.id);
    expect(executions[0].status).toBe("filled");
  });

  test("executeTrade blocks disallowed instruments", async () => {
    const previous = await getAgentConfig();
    await updateAgentConfig({ allowed_instruments: ["PAXGUSDT"], enabled: true, kill_switch: false, mode: "paper" });

    const trade = await insertTrade({
      signal_id: null,
      agent_config_id: null,
      instrument: "GOLD-USDT",
      side: "long",
      quantity: 1,
      status: "placed",
      mode: "paper",
      client_order_id: `gvfx-test-${Date.now()}`,
    });

    await expect(
      executeTrade({
        id: trade.id,
        instrument: trade.instrument,
        side: trade.side,
        quantity: trade.quantity,
        mode: trade.mode,
        client_order_id: trade.client_order_id,
        idempotency_key: `test-idempotency-${Date.now()}`,
      }),
    ).rejects.toThrow("not allowed");

    await updateAgentConfig({
      allowed_instruments: previous.allowed_instruments ?? ["GOLD-USDT"],
      enabled: previous.enabled,
      kill_switch: previous.kill_switch,
      mode: previous.mode,
    });
  });
}
