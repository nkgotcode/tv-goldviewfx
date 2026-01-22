type AgentConfig = {
  enabled: boolean;
  max_position_size: number;
  daily_loss_limit: number;
  kill_switch?: boolean;
};

export type RiskDecision = {
  allowed: boolean;
  reason: string | null;
};

export function evaluateTrade(config: AgentConfig, quantity: number): RiskDecision {
  if (config.kill_switch) {
    return { allowed: false, reason: "kill-switch" };
  }
  if (!config.enabled) {
    return { allowed: false, reason: "agent-disabled" };
  }
  if (config.max_position_size <= 0) {
    return { allowed: false, reason: "max-position-size" };
  }
  if (quantity > config.max_position_size) {
    return { allowed: false, reason: "position-size-exceeded" };
  }
  if (config.daily_loss_limit < 0) {
    return { allowed: false, reason: "daily-loss-limit" };
  }
  return { allowed: true, reason: null };
}
