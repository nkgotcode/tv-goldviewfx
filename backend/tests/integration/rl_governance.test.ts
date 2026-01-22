import { test, expect } from "bun:test";
import { rlApiRequest } from "../fixtures/rl_api";

const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!hasEnv) {
  test.skip("rl governance requires Supabase configuration", () => {});
} else {
  test("kill switch toggle updates config", async () => {
    const enable = await rlApiRequest("/agents/gold-rl-agent/kill-switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, reason: "test" }),
    });
    expect(enable.status).toBe(200);
    const enabled = await enable.json();
    expect(enabled.enabled).toBe(true);

    const disable = await rlApiRequest("/agents/gold-rl-agent/kill-switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(disable.status).toBe(200);
    const disabled = await disable.json();
    expect(disabled.enabled).toBe(false);
  });

  test("promotion gates can be updated", async () => {
    const response = await rlApiRequest("/agents/gold-rl-agent/promotion-gates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        promotion_required: true,
        promotion_min_trades: 5,
        promotion_min_win_rate: 0.5,
        promotion_max_drawdown: 0.3,
      }),
    });
    expect(response.status).toBe(200);
    const config = await response.json();
    expect(config.promotion_required).toBe(true);
    expect(config.promotion_min_trades).toBe(5);

    await rlApiRequest("/agents/gold-rl-agent/promotion-gates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        promotion_required: false,
        promotion_min_trades: 0,
        promotion_min_win_rate: 0,
        promotion_max_drawdown: 0,
      }),
    });
  });

  test("source policies patch returns updated list", async () => {
    const response = await rlApiRequest("/agents/gold-rl-agent/source-policies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          source_type: "news",
          enabled: true,
          min_confidence_score: 0.2,
          notes: "test policy",
        },
      ]),
    });
    expect(response.status).toBe(200);
    const policies = await response.json();
    expect(Array.isArray(policies)).toBe(true);
    expect(policies.length).toBeGreaterThan(0);
  });
}
