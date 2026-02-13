import { test, expect } from "bun:test";
import { getAgentConfig, updateAgentConfig } from "../../src/db/repositories/agent_config";
import { startAgentRun } from "../../src/services/rl_agent_service";

const hasEnv = Boolean(process.env.CONVEX_URL);

if (!hasEnv) {
  test.skip("allowed instrument tests require Convex configuration", () => {});
} else {
  test("agent run blocks disallowed instruments", async () => {
    const previous = await getAgentConfig();
    await updateAgentConfig({ allowed_instruments: ["PAXGUSDT"] });
    try {
      await expect(
        startAgentRun({
          mode: "paper",
          pair: "Gold-USDT",
          riskLimitSetId: "11111111-1111-4111-8111-111111111111",
        }),
      ).rejects.toThrow("not allowed");
    } finally {
      await updateAgentConfig({ allowed_instruments: previous.allowed_instruments ?? ["GOLD-USDT"] });
    }
  });
}
