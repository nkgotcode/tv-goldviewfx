import { test, expect } from "bun:test";
import { getOrCreateSource } from "../../src/db/repositories/sources";
import { insertIdea } from "../../src/db/repositories/ideas";
import { insertSignal } from "../../src/db/repositories/signals";
import { hashContent } from "../../src/services/dedup";
import { evaluateSourcePolicy } from "../../src/services/source_policy_service";
import { upsertSourcePolicy } from "../../src/db/repositories/source_policies";
import { updateAgentConfig } from "../../src/db/repositories/agent_config";
import { insertTrade } from "../../src/db/repositories/trades";
import { executeTrade } from "../../src/services/trade_execution";

const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!hasEnv) {
  test.skip("source gating tests require Supabase configuration", () => {});
} else {
  test("source policy blocks low confidence signals", async () => {
    const source = await getOrCreateSource("tradingview", `gate-${Date.now()}`, "Gate Source");
    const idea = await insertIdea({
      source_id: source.id,
      external_id: `ext-${Date.now()}`,
      url: "https://example.com",
      title: "Gate Idea",
      author_handle: "tester",
      content: "Idea content",
      content_hash: hashContent("Idea content"),
      published_at: new Date().toISOString(),
      dedup_status: "canonical",
    });
    const signal = await insertSignal({
      source_type: "tradingview",
      idea_id: idea.id,
      enrichment_id: null,
      payload_summary: "summary",
      confidence_score: 0.2,
    });

    const decision = await evaluateSourcePolicy({
      signalId: signal.id,
      minConfidenceScore: 0.5,
      allowedSourceIds: [source.id],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("min_confidence");

    await upsertSourcePolicy({
      source_id: source.id,
      source_type: "tradingview",
      enabled: false,
    });

    const disabledDecision = await evaluateSourcePolicy({
      signalId: signal.id,
      minConfidenceScore: 0,
      allowedSourceIds: [source.id],
    });
    expect(disabledDecision.allowed).toBe(false);
    expect(disabledDecision.reason).toBe("source_disabled");
  });

  test("promotion gate blocks live execution", async () => {
    await updateAgentConfig({
      promotion_required: true,
      promotion_min_trades: 5,
      promotion_min_win_rate: 0.6,
      promotion_min_net_pnl: 10,
      promotion_max_drawdown: 1,
      kill_switch: false,
    });

    const trade = await insertTrade({
      signal_id: null,
      agent_config_id: null,
      instrument: "GOLD-USDT",
      side: "long",
      quantity: 1,
      status: "placed",
      mode: "live",
      client_order_id: `promo-${Date.now()}`,
    });

    let threw = false;
    try {
      await executeTrade({
        id: trade.id,
        instrument: trade.instrument,
        side: "long",
        quantity: trade.quantity,
        mode: "live",
        client_order_id: trade.client_order_id ?? null,
      });
    } catch (error) {
      threw = true;
    }
    expect(threw).toBe(true);
  });
}
