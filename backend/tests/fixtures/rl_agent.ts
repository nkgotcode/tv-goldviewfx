import type { AgentRunInsert } from "../../src/db/repositories/agent_runs";
import type { AgentVersionInsert } from "../../src/db/repositories/agent_versions";
import type { RiskLimitSetInsert } from "../../src/db/repositories/risk_limit_sets";

export const riskLimitSetFixture: RiskLimitSetInsert = {
  name: "Test Limits",
  max_position_size: 1.25,
  leverage_cap: 3,
  max_daily_loss: 250,
  max_drawdown: 400,
  max_open_positions: 2,
  active: true,
};

export const agentVersionFixture: AgentVersionInsert = {
  name: "RL Test Version",
  training_window_start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  training_window_end: new Date().toISOString(),
  algorithm_label: "PPO",
  hyperparameter_summary: "gamma=0.99",
  artifact_uri: "supabase://models/rl-test",
  status: "draft",
};

export function buildAgentRunFixture(ids: { agentVersionId: string; riskLimitSetId: string }): AgentRunInsert {
  return {
    mode: "paper",
    pair: "Gold-USDT",
    status: "running",
    learning_enabled: true,
    learning_window_minutes: 60,
    agent_version_id: ids.agentVersionId,
    risk_limit_set_id: ids.riskLimitSetId,
  };
}
