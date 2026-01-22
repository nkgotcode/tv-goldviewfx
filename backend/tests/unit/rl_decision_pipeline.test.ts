import { test, expect } from "bun:test";
import { mapInferenceToDecision } from "../../src/services/rl_decision_pipeline";

const inference = {
  decision: {
    action: "long",
    confidenceScore: 0.8,
    size: 1,
    reason: "signal",
    riskCheckResult: "pass",
  },
  features: {},
  warnings: [],
  modelVersion: null,
};

test("mapInferenceToDecision preserves decision when risk allowed", () => {
  const decision = mapInferenceToDecision(inference, true);
  expect(decision.action).toBe("long");
  expect(decision.riskCheckResult).toBe("pass");
});

test("mapInferenceToDecision forces hold when risk blocked", () => {
  const decision = mapInferenceToDecision(inference, false);
  expect(decision.action).toBe("hold");
  expect(decision.riskCheckResult).toBe("fail");
});
