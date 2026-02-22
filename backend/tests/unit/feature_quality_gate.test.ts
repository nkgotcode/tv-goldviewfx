import { expect, test } from "bun:test";
import { evaluateFeatureQualityGate } from "../../src/services/feature_quality_gate";

test("feature quality gate blocks missing critical fields", () => {
  const result = evaluateFeatureQualityGate({
    features: { last_price: 2300 },
    candles: [{ timestamp: new Date().toISOString(), close: 2300 }],
    criticalFields: ["last_price", "rsi_14"],
  });
  expect(result.allowed).toBe(false);
  expect(result.reason).toBe("feature_missing_critical");
  expect(result.missingFields.includes("rsi_14")).toBe(true);
});

test("feature quality gate passes valid features", () => {
  const now = Date.now();
  const candles = Array.from({ length: 20 }).map((_, idx) => ({
    timestamp: new Date(now - (20 - idx) * 60_000).toISOString(),
    close: 2000 + idx,
  }));
  const result = evaluateFeatureQualityGate({
    features: { last_price: 2020, rsi_14: 52, price_change: 0.001 },
    candles,
    criticalFields: ["last_price", "rsi_14", "price_change"],
  });
  expect(result.allowed).toBe(true);
});
