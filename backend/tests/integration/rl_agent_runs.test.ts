import { test, expect } from "bun:test";
import { insertRiskLimitSet } from "../../src/db/repositories/risk_limit_sets";
import { insertAgentVersion } from "../../src/db/repositories/agent_versions";
import { rlApiRequest } from "../fixtures/rl_api";

const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!hasEnv) {
  test.skip("rl agent runs require Supabase configuration", () => {});
} else {
  test("agent run lifecycle", async () => {
    const riskLimit = await insertRiskLimitSet({
      name: `Run Limits ${Date.now()}`,
      max_position_size: 1.2,
      leverage_cap: 3,
      max_daily_loss: 200,
      max_drawdown: 300,
      max_open_positions: 2,
      active: true,
    });

    await insertAgentVersion({
      name: `Run Version ${Date.now()}`,
      status: "promoted",
      artifact_uri: "supabase://models/test",
    });

    const startResponse = await rlApiRequest("/agents/gold-rl-agent/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "paper",
        pair: "XAUTUSDT",
        riskLimitSetId: riskLimit.id,
        learningEnabled: true,
        learningWindowMinutes: 30,
      }),
    });

    expect(startResponse.status).toBe(200);
    const run = await startResponse.json();
    expect(run.status).toBe("running");

    const pauseResponse = await rlApiRequest("/agents/gold-rl-agent/pause", { method: "POST" });
    expect(pauseResponse.status).toBe(200);
    const paused = await pauseResponse.json();
    expect(paused.status).toBe("paused");

    const resumeResponse = await rlApiRequest("/agents/gold-rl-agent/resume", { method: "POST" });
    expect(resumeResponse.status).toBe(200);
    const resumed = await resumeResponse.json();
    expect(resumed.status).toBe("running");

    const stopResponse = await rlApiRequest("/agents/gold-rl-agent/stop", { method: "POST" });
    expect(stopResponse.status).toBe(200);
    const stopped = await stopResponse.json();
    expect(stopped.status).toBe("stopped");

    const listResponse = await rlApiRequest("/agents/gold-rl-agent/runs", { method: "GET" });
    expect(listResponse.status).toBe(200);
    const runs = await listResponse.json();
    expect(Array.isArray(runs)).toBe(true);
  });
}
