import { test, expect } from "bun:test";
import { insertRiskLimitSet } from "../../src/db/repositories/risk_limit_sets";
import { insertAgentVersion } from "../../src/db/repositories/agent_versions";
import { rlApiRequest } from "../fixtures/rl_api";
import { listTradeExecutionsByDecision } from "../../src/db/repositories/trade_executions";
import { upsertDataSourceStatus } from "../../src/db/repositories/data_source_status";
import { BINGX_SOURCE_TYPES } from "../../src/services/data_source_status_service";

const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

function buildCandles() {
  const now = Date.now();
  const base = 2000;
  const step = 250;
  return Array.from({ length: 5 }).map((_, idx) => ({
    timestamp: new Date(now - (5 - idx) * 60000).toISOString(),
    open: base + step * idx,
    high: base + step * idx + 2,
    low: base + step * idx - 2,
    close: base + step * idx + 1,
    volume: 100 + idx,
  }));
}

if (!hasEnv) {
  test.skip("rl decision pipeline requires Supabase configuration", () => {});
} else {
  test("decision pipeline links executions", async () => {
    const riskLimit = await insertRiskLimitSet({
      name: `Decision Limits ${Date.now()}`,
      max_position_size: 1.0,
      leverage_cap: 3,
      max_daily_loss: 200,
      max_drawdown: 300,
      max_open_positions: 2,
      active: true,
    });

    await insertAgentVersion({
      name: `Decision Version ${Date.now()}`,
      status: "promoted",
      artifact_uri: "supabase://models/test",
    });

    const now = new Date().toISOString();
    await Promise.all(
      BINGX_SOURCE_TYPES.map((sourceType) =>
        upsertDataSourceStatus({
          pair: "PAXGUSDT",
          source_type: sourceType,
          last_seen_at: now,
          freshness_threshold_seconds: 120,
          status: "ok",
        }),
      ),
    );

    const startResponse = await rlApiRequest("/agents/gold-rl-agent/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "paper",
        pair: "PAXGUSDT",
        riskLimitSetId: riskLimit.id,
        learningEnabled: true,
        learningWindowMinutes: 30,
      }),
    });

    const run = await startResponse.json();
    expect(startResponse.status).toBe(200);

    const decisionResponse = await rlApiRequest(`/agents/gold-rl-agent/runs/${run.id}/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        market: { candles: buildCandles(), lastPrice: 2302.5, spread: 0.5 },
        ideas: [{ source: "ideas", timestamp: new Date().toISOString(), score: 0.4 }],
        simulateExecutionStatus: "partial",
      }),
    });

    expect(decisionResponse.status).toBe(200);
    const result = await decisionResponse.json();
    expect(result.tradeDecisionId).toBeTruthy();

    const executions = await listTradeExecutionsByDecision(result.tradeDecisionId);
    expect(executions.length).toBeGreaterThan(0);
    expect(executions[0].status).toBe("partial");

    await rlApiRequest("/agents/gold-rl-agent/stop", { method: "POST" });
  });
}
