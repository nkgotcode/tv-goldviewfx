import { test, expect } from "bun:test";
import { insertAccountRiskPolicy } from "../../src/db/repositories/account_risk_policies";
import { insertTrade } from "../../src/db/repositories/trades";
import { enforceAccountRisk, evaluateAccountRisk } from "../../src/services/account_risk_service";
import { updateAgentConfig, getAgentConfig } from "../../src/db/repositories/agent_config";

const hasEnv = Boolean(process.env.CONVEX_URL);

if (!hasEnv) {
  test.skip("account risk guardrails require Convex configuration", () => {});
} else {
  test("account risk blocks exposure breaches", async () => {
    await insertAccountRiskPolicy({
      name: `Low Exposure ${Date.now()}`,
      max_total_exposure: 1,
      max_instrument_exposure: 1,
      max_open_positions: 10,
      max_daily_loss: 1000,
      circuit_breaker_loss: 5000,
      cooldown_minutes: 5,
      active: true,
      effective_from: new Date().toISOString(),
    });

    await insertTrade({
      signal_id: null,
      agent_config_id: null,
      instrument: "GOLD-USDT",
      side: "long",
      quantity: 1,
      status: "filled",
      mode: "paper",
      position_size: 1,
    });

    await expect(
      enforceAccountRisk({
        instrument: "GOLD-USDT",
        quantity: 1,
      }),
    ).rejects.toThrow("Account risk blocked");
  });

  test("circuit breaker engages on daily loss", async () => {
    await updateAgentConfig({ kill_switch: false, kill_switch_reason: null });

    await insertAccountRiskPolicy({
      name: `Circuit Breaker ${Date.now()}`,
      max_total_exposure: 1000,
      max_instrument_exposure: 1000,
      max_open_positions: 100,
      max_daily_loss: 1000,
      circuit_breaker_loss: 1,
      cooldown_minutes: 1,
      active: true,
      effective_from: new Date(Date.now() + 1000).toISOString(),
    });

    await insertTrade({
      signal_id: null,
      agent_config_id: null,
      instrument: "GOLD-USDT",
      side: "long",
      quantity: 1,
      status: "filled",
      mode: "paper",
      pnl: -5,
    });

    const evaluation = await evaluateAccountRisk({
      instrument: "GOLD-USDT",
      quantity: 0,
    });

    expect(evaluation.reasons).toContain("circuit_breaker");
    const config = await getAgentConfig();
    expect(config.kill_switch).toBe(true);
  });
}
