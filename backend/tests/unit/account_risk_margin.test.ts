import { expect, test } from "bun:test";
import { evaluateMarginFeasibility } from "../../src/services/account_risk_service";

test("margin feasibility passes with adequate headroom and liquidation buffer", () => {
  const result = evaluateMarginFeasibility({
    projectedNotional: 2_000,
    totalExposure: 10_000,
    leverage: 5,
    policyMaxTotalExposure: 100_000,
    policyMaxLeverage: 10,
    minLiquidationBufferBps: 50,
  });

  expect(result.allowed).toBe(true);
  expect(result.reasons).toEqual([]);
  expect(result.metrics.liquidationBufferBps).toBeCloseTo(2_000, 6);
});

test("margin feasibility rejects insufficient margin headroom", () => {
  const result = evaluateMarginFeasibility({
    projectedNotional: 40_000,
    totalExposure: 60_000,
    leverage: 1,
    policyMaxTotalExposure: 80_000,
    policyMaxLeverage: 10,
    minLiquidationBufferBps: 50,
  });

  expect(result.allowed).toBe(false);
  expect(result.reasons).toContain("insufficient_margin_headroom");
});

test("margin feasibility rejects liquidation buffer below threshold", () => {
  const result = evaluateMarginFeasibility({
    projectedNotional: 5_000,
    totalExposure: 0,
    leverage: 250,
    policyMaxTotalExposure: 100_000,
    policyMaxLeverage: 250,
    minLiquidationBufferBps: 60,
  });

  expect(result.allowed).toBe(false);
  expect(result.reasons).toContain("liquidation_buffer_too_low");
  expect(result.metrics.liquidationBufferBps).toBeCloseTo(40, 6);
});
