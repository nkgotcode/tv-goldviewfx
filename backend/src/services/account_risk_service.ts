import { convex } from "../db/client";
import {
  getActiveAccountRiskPolicy,
  insertAccountRiskPolicy,
  type AccountRiskPolicyInsert,
} from "../db/repositories/account_risk_policies";
import {
  getLatestAccountRiskState,
  insertAccountRiskState,
  updateAccountRiskState,
} from "../db/repositories/account_risk_state";
import { listTradesByStatuses } from "../db/repositories/trades";
import { updateAgentConfig, getAgentConfig } from "../db/repositories/agent_config";
import { recordOpsAudit } from "./ops_audit";

type AccountRiskPolicy = AccountRiskPolicyInsert & { id: string };
type AccountRiskState = {
  id: string;
  status: "ok" | "cooldown";
  cooldown_until?: string | null;
  last_triggered_at?: string | null;
  trigger_reason?: string | null;
};

export type AccountRiskSnapshot = {
  exposureByInstrument: Record<string, number>;
  totalExposure: number;
  openPositions: number;
  dailyLoss: number;
};

export type AccountRiskInput = {
  instrument: string;
  quantity: number;
  leverage?: number | null;
};

export type AccountRiskEvaluation = {
  allowed: boolean;
  reasons: string[];
  snapshot: AccountRiskSnapshot;
  policy: AccountRiskPolicy;
  state: AccountRiskState;
};

const DEFAULT_POLICY: AccountRiskPolicyInsert = {
  name: "Baseline Account Risk",
  max_total_exposure: 100000,
  max_instrument_exposure: 50000,
  max_open_positions: 1000,
  max_daily_loss: 100000,
  circuit_breaker_loss: 200000,
  cooldown_minutes: 30,
  max_leverage: 100,
  active: true,
  effective_from: new Date().toISOString(),
};

async function ensurePolicy(): Promise<AccountRiskPolicy> {
  const active = await getActiveAccountRiskPolicy();
  if (active) {
    return active as AccountRiskPolicy;
  }
  const created = await insertAccountRiskPolicy(DEFAULT_POLICY);
  return created as AccountRiskPolicy;
}

async function ensureState(): Promise<AccountRiskState> {
  const latest = await getLatestAccountRiskState();
  if (latest) {
    return latest as AccountRiskState;
  }
  const created = await insertAccountRiskState({
    status: "ok",
    cooldown_until: null,
    last_triggered_at: null,
    trigger_reason: null,
    updated_at: new Date().toISOString(),
  });
  return created as AccountRiskState;
}

function startOfUtcDay() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

async function computeSnapshot(input: AccountRiskInput): Promise<AccountRiskSnapshot> {
  const openTrades = (await listTradesByStatuses(["placed", "partial", "filled"])).filter((trade) => {
    if (trade.closed_at) return false;
    const rawSize = Number(trade.position_size ?? trade.quantity ?? 0);
    const size = Number.isFinite(rawSize) ? rawSize : 0;
    return size > 0;
  });
  const exposureByInstrument: Record<string, number> = {};
  let totalExposure = 0;

  for (const trade of openTrades) {
    const rawSize = Number(trade.position_size ?? trade.quantity ?? 0);
    const size = Number.isFinite(rawSize) ? rawSize : 0;
    exposureByInstrument[trade.instrument] = (exposureByInstrument[trade.instrument] ?? 0) + size;
    totalExposure += size;
  }

  const start = startOfUtcDay();
  const todaysTrades = await convex.from("trades").select("*").gte("created_at", start);
  let dailyLoss = 0;
  for (const trade of todaysTrades.data ?? []) {
    const rawPnl = Number(trade.pnl ?? 0);
    const pnl = Number.isFinite(rawPnl) ? rawPnl : 0;
    if (pnl < 0) {
      dailyLoss += Math.abs(pnl);
    }
  }

  return {
    exposureByInstrument,
    totalExposure,
    openPositions: openTrades.length,
    dailyLoss,
  };
}

async function clearCooldownIfExpired(state: AccountRiskState) {
  if (state.status !== "cooldown" || !state.cooldown_until) {
    return state;
  }
  const now = Date.now();
  const cooldownUntil = Date.parse(state.cooldown_until);
  if (Number.isNaN(cooldownUntil) || cooldownUntil > now) {
    return state;
  }
  const updated = await updateAccountRiskState(state.id, {
    status: "ok",
    cooldown_until: null,
    trigger_reason: null,
  });
  const config = await getAgentConfig();
  if (config.kill_switch && config.kill_switch_reason === "account_risk_circuit_breaker") {
    await updateAgentConfig({ kill_switch: false, kill_switch_reason: null });
  }
  await recordOpsAudit({
    actor: "system",
    action: "account_risk.cooldown_cleared",
    resource_type: "account_risk_state",
    resource_id: state.id,
  });
  return updated as AccountRiskState;
}

async function triggerCircuitBreaker(state: AccountRiskState, policy: AccountRiskPolicy, reason: string) {
  const cooldownUntil = new Date(Date.now() + policy.cooldown_minutes * 60 * 1000).toISOString();
  const updated = await updateAccountRiskState(state.id, {
    status: "cooldown",
    cooldown_until: cooldownUntil,
    last_triggered_at: new Date().toISOString(),
    trigger_reason: reason,
  });
  await updateAgentConfig({ kill_switch: true, kill_switch_reason: "account_risk_circuit_breaker" });
  await recordOpsAudit({
    actor: "system",
    action: "account_risk.circuit_breaker",
    resource_type: "account_risk_state",
    resource_id: state.id,
    metadata: { reason, cooldown_until: cooldownUntil },
  });
  return updated as AccountRiskState;
}

export async function evaluateAccountRisk(input: AccountRiskInput): Promise<AccountRiskEvaluation> {
  const policy = await ensurePolicy();
  let state = await ensureState();
  state = await clearCooldownIfExpired(state);

  const snapshot = await computeSnapshot(input);
  const exposureByInstrument = snapshot.exposureByInstrument[input.instrument] ?? 0;

  const reasons: string[] = [];
  if (snapshot.totalExposure + input.quantity > policy.max_total_exposure) {
    reasons.push("max_total_exposure");
  }
  if (exposureByInstrument + input.quantity > policy.max_instrument_exposure) {
    reasons.push("max_instrument_exposure");
  }
  if (snapshot.openPositions + 1 > policy.max_open_positions) {
    reasons.push("max_open_positions");
  }
  if (snapshot.dailyLoss > policy.max_daily_loss) {
    reasons.push("max_daily_loss");
  }
  if (policy.max_leverage && input.leverage && input.leverage > policy.max_leverage) {
    reasons.push("max_leverage");
  }

  if (snapshot.dailyLoss >= policy.circuit_breaker_loss) {
    state = await triggerCircuitBreaker(state, policy, "daily_loss_limit");
    reasons.push("circuit_breaker");
  }

  if (state.status === "cooldown") {
    reasons.push("cooldown_active");
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    snapshot,
    policy,
    state,
  };
}

export async function enforceAccountRisk(input: AccountRiskInput) {
  const evaluation = await evaluateAccountRisk(input);
  if (!evaluation.allowed) {
    throw new Error(`Account risk blocked: ${evaluation.reasons.join(",")}`);
  }
  return evaluation;
}

export async function getAccountRiskSummary() {
  const policy = await ensurePolicy();
  let state = await ensureState();
  state = await clearCooldownIfExpired(state);
  const snapshot = await computeSnapshot({ instrument: "", quantity: 0 });
  return { policy, state, snapshot };
}
