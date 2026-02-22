import { test, expect } from "bun:test";
import {
  recordDecisionLatencyMetric,
  recordDecisionConfidenceMetric,
  recordIngestionLagMetric,
  recordExecutionSlippage,
} from "../../src/services/observability_service";
import { listOpsAlerts } from "../../src/db/repositories/ops_alerts";
import { listObservabilityMetrics } from "../../src/db/repositories/observability_metrics";
import { insertTradeDecision } from "../../src/db/repositories/trade_decisions";

const hasEnv = process.env.CONVEX_TEST_ENABLED === "true";

if (!hasEnv) {
  test.skip("observability metrics require Convex configuration", () => {});
} else {
  test("decision latency breaches create SLO alerts", async () => {
    await recordDecisionLatencyMetric({
      runId: "run-latency",
      pair: "Gold-USDT",
      latencyMs: 5000,
    });

    const alerts = await listOpsAlerts(10);
    expect(alerts.some((alert) => alert.metric === "decision_latency_ms")).toBe(true);
  });

  test("ingestion lag breaches create SLO alerts", async () => {
    await recordIngestionLagMetric({
      pair: "Gold-USDT",
      sourceType: "bingx_candles",
      lagSeconds: 5000,
      thresholdSeconds: 120,
    });

    const alerts = await listOpsAlerts(10);
    expect(alerts.some((alert) => alert.metric === "ingestion_lag_seconds")).toBe(true);
  });

  test("decision confidence drift creates alerts", async () => {
    await recordDecisionConfidenceMetric({
      runId: "run-drift",
      confidenceScore: 0.99,
    });

    const alerts = await listOpsAlerts(20);
    expect(alerts.some((alert) => alert.category === "drift")).toBe(true);
  });

  test("slippage metrics recorded from executions", async () => {
    const decision = await insertTradeDecision({
      agent_run_id: "run-slippage",
      pair: "Gold-USDT",
      action: "long",
      confidence_score: 0.5,
      reference_price: 2000,
    });

    await recordExecutionSlippage({
      tradeId: "trade-slippage",
      executionId: "exec-slippage",
      tradeDecisionId: decision.id,
      averagePrice: 2010,
    });

    const metrics = await listObservabilityMetrics("slippage_bps", 5);
    expect(metrics.length).toBeGreaterThan(0);
  });
}
