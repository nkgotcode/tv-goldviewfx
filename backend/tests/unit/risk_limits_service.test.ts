import { test, expect } from "bun:test";
import { evaluateRiskLimits, type RiskLimitSetRecord } from "../../src/services/risk_limits_service";

const limit: RiskLimitSetRecord = {
  id: "limit",
  name: "Test",
  max_position_size: 1,
  leverage_cap: 3,
  max_daily_loss: 100,
  max_drawdown: 200,
  max_open_positions: 2,
  effective_from: new Date().toISOString(),
  active: true,
};

test("evaluateRiskLimits allows trades within limits", () => {
  const result = evaluateRiskLimits(limit, { positionSize: 0.5, leverage: 2, openPositions: 1 });
  expect(result.allowed).toBe(true);
  expect(result.reasons).toEqual([]);
});

test("evaluateRiskLimits blocks size breaches", () => {
  const result = evaluateRiskLimits(limit, { positionSize: 2 });
  expect(result.allowed).toBe(false);
  expect(result.reasons).toContain("max_position_size");
});

test("evaluateRiskLimits blocks open position cap", () => {
  const result = evaluateRiskLimits(limit, { positionSize: 0.2, openPositions: 2 });
  expect(result.allowed).toBe(false);
  expect(result.reasons).toContain("max_open_positions");
});
