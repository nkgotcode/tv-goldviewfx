import { convex } from "../client";
import { assertNoError } from "./base";

export type AgentConfigUpdate = {
  enabled?: boolean;
  mode?: "paper" | "live";
  max_position_size?: number;
  daily_loss_limit?: number;
  allowed_instruments?: string[];
  kill_switch?: boolean;
  kill_switch_reason?: string | null;
  min_confidence_score?: number;
  allowed_source_ids?: string[];
  promotion_required?: boolean;
  promotion_min_trades?: number;
  promotion_min_win_rate?: number;
  promotion_min_net_pnl?: number;
  promotion_max_drawdown?: number;
};

const DEFAULT_CONFIG = {
  enabled: false,
  mode: "paper" as const,
  max_position_size: 1,
  daily_loss_limit: 0,
  allowed_instruments: ["GOLD-USDT"],
  kill_switch: false,
  kill_switch_reason: null,
  min_confidence_score: 0,
  allowed_source_ids: [],
  promotion_required: false,
  promotion_min_trades: 0,
  promotion_min_win_rate: 0,
  promotion_min_net_pnl: 0,
  promotion_max_drawdown: 0,
};

export async function getAgentConfig() {
  const result = await convex
    .from("agent_configurations")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.data) {
    return result.data;
  }

  const created = await convex
    .from("agent_configurations")
    .insert(DEFAULT_CONFIG)
    .select("*")
    .single();

  return assertNoError(created, "create agent config");
}

export async function updateAgentConfig(payload: AgentConfigUpdate) {
  const current = await getAgentConfig();
  const updated = await convex
    .from("agent_configurations")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", current.id)
    .select("*")
    .single();

  return assertNoError(updated, "update agent config");
}
