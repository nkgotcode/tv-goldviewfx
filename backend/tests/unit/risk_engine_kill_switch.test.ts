import { test, expect } from "bun:test";
import { evaluateTrade } from "../../src/services/risk_engine";

test("kill switch blocks trades", () => {
  const decision = evaluateTrade(
    { enabled: true, max_position_size: 1, daily_loss_limit: 0, kill_switch: true },
    1,
  );
  expect(decision.allowed).toBe(false);
  expect(decision.reason).toBe("kill-switch");
});
