import { expect, test } from "bun:test";
import { evaluatePromotionDecision, type PromotionGates } from "../../src/jobs/learning_updates";

const baseGates: PromotionGates = {
  minWinRate: 0.5,
  minNetPnl: 0,
  maxDrawdown: 0.4,
  minTradeCount: 1,
  minWinRateDelta: 0,
  minNetPnlDelta: 0,
  maxDrawdownDelta: 0.5,
  minTradeCountDelta: -1000,
  minEffectSize: 0,
  minConfidenceZ: 0,
  minSampleSize: 0,
};

test("confidence-aware gates reject weak challenger uplift", () => {
  const decision = evaluatePromotionDecision({
    challenger: {
      winRate: 0.62,
      netPnlAfterFees: 120,
      maxDrawdown: 0.18,
      tradeCount: 50,
    },
    champion: {
      winRate: 0.6,
      netPnlAfterFees: 100,
      maxDrawdown: 0.2,
      tradeCount: 50,
    },
    promotionGates: {
      ...baseGates,
      minEffectSize: 0.03,
      minConfidenceZ: 1.64,
      minSampleSize: 30,
    },
  });

  expect(decision.promoted).toBe(false);
  expect(decision.reasons).toContain("effect_size_below_gate");
  expect(decision.reasons).toContain("confidence_below_gate");
});

test("confidence-aware gates pass when uplift is large and statistically confident", () => {
  const decision = evaluatePromotionDecision({
    challenger: {
      winRate: 0.75,
      netPnlAfterFees: 240,
      maxDrawdown: 0.1,
      tradeCount: 200,
    },
    champion: {
      winRate: 0.55,
      netPnlAfterFees: 170,
      maxDrawdown: 0.16,
      tradeCount: 200,
    },
    promotionGates: {
      ...baseGates,
      minEffectSize: 0.08,
      minConfidenceZ: 2.0,
      minSampleSize: 100,
    },
  });

  expect(decision.promoted).toBe(true);
  expect(decision.reasons).toEqual([]);
  expect(decision.deltas.winRateEffectSize).toBeCloseTo(0.2, 6);
  expect(decision.deltas.winRateConfidenceZ).toBeGreaterThanOrEqual(2);
});

test("sample-size gate blocks promotions with underpowered windows", () => {
  const decision = evaluatePromotionDecision({
    challenger: {
      winRate: 0.9,
      netPnlAfterFees: 50,
      maxDrawdown: 0.05,
      tradeCount: 12,
    },
    champion: {
      winRate: 0.45,
      netPnlAfterFees: 20,
      maxDrawdown: 0.15,
      tradeCount: 10,
    },
    promotionGates: {
      ...baseGates,
      minEffectSize: 0.1,
      minConfidenceZ: 0.5,
      minSampleSize: 30,
    },
  });

  expect(decision.promoted).toBe(false);
  expect(decision.reasons).toContain("insufficient_sample_size");
});
