import { expect, test } from "bun:test";
import { insertEvaluationReport } from "../../src/db/repositories/evaluation_reports";
import { requireRlOpsTimescaleEnabled, rlOpsUsesTimescale } from "../../src/db/timescale/rl_ops";

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T | Promise<T>) {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return Promise.resolve(fn()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test("rlOpsUsesTimescale fails fast when enabled without TIMESCALE_URL", () =>
  withEnv({ TIMESCALE_RL_OPS_ENABLED: "true", TIMESCALE_URL: undefined }, () => {
    expect(() => rlOpsUsesTimescale()).toThrow("TIMESCALE_RL_OPS_ENABLED=true requires TIMESCALE_URL");
  }));

test("requireRlOpsTimescaleEnabled blocks disabled RL/ops fallback", () =>
  withEnv({ TIMESCALE_RL_OPS_ENABLED: "false", TIMESCALE_URL: undefined }, () => {
    expect(() => requireRlOpsTimescaleEnabled("unit-test")).toThrow(
      "unit-test requires TIMESCALE_RL_OPS_ENABLED=true; Convex fallback is disabled.",
    );
  }));

test("RL evaluation repository does not silently fallback to Convex", async () => {
  await withEnv({ TIMESCALE_RL_OPS_ENABLED: "false", TIMESCALE_URL: undefined }, async () => {
    await expect(
      insertEvaluationReport({
        agent_version_id: "agent-v",
        pair: "XAUTUSDT",
        period_start: new Date(Date.now() - 60_000).toISOString(),
        period_end: new Date().toISOString(),
        win_rate: 0,
        net_pnl_after_fees: 0,
        max_drawdown: 0,
        trade_count: 0,
        exposure_by_pair: {},
        status: "fail",
      }),
    ).rejects.toThrow("insertEvaluationReport requires TIMESCALE_RL_OPS_ENABLED=true; Convex fallback is disabled.");
  });
});
