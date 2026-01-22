import { test, expect } from "bun:test";
import { insertDriftAlert } from "../../src/db/repositories/drift_alerts";
import { rlApiRequest } from "../fixtures/rl_api";

const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!hasEnv) {
  test.skip("drift alerts require Supabase configuration", () => {});
} else {
  test("drift alerts endpoint lists recorded alerts", async () => {
    const created = await insertDriftAlert({
      agent_id: "gold-rl-agent",
      metric: "win_rate",
      baseline_value: 0.6,
      current_value: 0.4,
      status: "open",
    });

    const response = await rlApiRequest("/agents/gold-rl-agent/drift-alerts");
    expect(response.status).toBe(200);
    const alerts = await response.json();
    const ids = alerts.map((alert: { id: string }) => alert.id);
    expect(ids).toContain(created.id);
  });
}
