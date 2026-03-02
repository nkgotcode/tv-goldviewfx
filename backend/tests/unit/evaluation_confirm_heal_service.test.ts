import { expect, test } from "bun:test";
import { shouldQueueConfirmHeal } from "../../src/services/evaluation_confirm_heal_service";
import type { EvaluationConfirmHealPayload } from "../../src/services/evaluation_confirm_heal_service";

function buildPayload(overrides: Partial<EvaluationConfirmHealPayload> = {}): EvaluationConfirmHealPayload {
  return {
    agentId: "gold-rl-agent",
    actor: "test",
    evaluation: {
      pair: "XAUTUSDT",
      periodStart: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      periodEnd: new Date().toISOString(),
      interval: "5m",
      contextIntervals: ["15m", "1h"],
      decisionThreshold: 0.25,
      backtestMode: "l1",
      windowSize: 180,
      stride: 1,
      strategyIds: ["ema_trend", "bollinger_mean_rev", "funding_overlay"],
      venueIds: ["bingx_margin"],
      walkForward: null,
    },
    heal: {
      intervals: ["5m"],
      runGapMonitor: true,
    },
    ...overrides,
  };
}

test("shouldQueueConfirmHeal keeps short single-interval runs synchronous", () => {
  expect(shouldQueueConfirmHeal(buildPayload())).toBe(false);
});

test("shouldQueueConfirmHeal offloads long period runs", () => {
  const payload = buildPayload({
    evaluation: {
      ...buildPayload().evaluation,
      periodStart: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });
  expect(shouldQueueConfirmHeal(payload)).toBe(true);
});

test("shouldQueueConfirmHeal offloads walk-forward runs", () => {
  const payload = buildPayload({
    evaluation: {
      ...buildPayload().evaluation,
      walkForward: {
        folds: 4,
        purgeBars: 0,
        embargoBars: 0,
        minTrainBars: 900,
        strict: false,
      },
    },
  });
  expect(shouldQueueConfirmHeal(payload)).toBe(true);
});
