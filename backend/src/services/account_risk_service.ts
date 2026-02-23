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
import { getLatestMarkIndexSnapshot } from "../db/repositories/bingx_market_data/mark_index_prices";
import { listTrades, listTradesByStatuses } from "../db/repositories/trades";
import { updateAgentConfig, getAgentConfig } from "../db/repositories/agent_config";
import { loadEnv } from "../config/env";
import { fromBingxSymbol, getSupportedPairs, normalizePairToken, resolveSupportedPair, toBingxSymbol } from "../config/market_catalog";
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
  referencePrice?: number | null;
  leverage?: number | null;
};

export type AccountRiskEvaluation = {
  allowed: boolean;
  reasons: string[];
  snapshot: AccountRiskSnapshot;
  policy: AccountRiskPolicy;
  state: AccountRiskState;
};

export type MarginFeasibilityResult = {
  allowed: boolean;
  reasons: string[];
  metrics: {
    effectiveLeverage: number;
    liquidationBufferBps: number;
    projectedMarginUsage: number;
    maxMarginBudget: number;
    remainingMarginBudget: number;
  };
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

function resolveCandidatePairs(instrument: string) {
  const resolved = resolveSupportedPair(instrument) ?? fromBingxSymbol(instrument) ?? instrument;
  const target = normalizePairToken(toBingxSymbol(resolved));
  return getSupportedPairs().filter((pair) => normalizePairToken(toBingxSymbol(pair)) === target);
}

async function resolveReferencePrice(instrument: string, fallback?: number | null) {
  if (typeof fallback === "number" && Number.isFinite(fallback) && fallback > 0) {
    return fallback;
  }
  const candidates = resolveCandidatePairs(instrument);
  const snapshots = await Promise.all(
    candidates.map(async (pair) => {
      try {
        const snapshot = await getLatestMarkIndexSnapshot(pair);
        if (!snapshot) return null;
        const capturedAt = Date.parse(snapshot.captured_at ?? "");
        const markPrice = Number(snapshot.mark_price ?? 0);
        const indexPrice = Number(snapshot.index_price ?? 0);
        const price = markPrice > 0 ? markPrice : indexPrice > 0 ? indexPrice : 0;
        if (!Number.isFinite(capturedAt) || !Number.isFinite(price) || price <= 0) return null;
        return { capturedAt, price };
      } catch {
        return null;
      }
    }),
  );
  const latest = snapshots
    .filter((item): item is { capturedAt: number; price: number } => Boolean(item))
    .sort((left, right) => right.capturedAt - left.capturedAt)[0];
  return latest?.price ?? null;
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
  const instrumentPrices = new Map<string, number>();

  for (const trade of openTrades) {
    const rawSize = Number(trade.position_size ?? trade.quantity ?? 0);
    const size = Number.isFinite(rawSize) ? rawSize : 0;
    if (size <= 0) continue;
    let price = instrumentPrices.get(trade.instrument);
    if (!price) {
      const resolved = await resolveReferencePrice(trade.instrument, Number(trade.avg_fill_price ?? 0));
      price = resolved ?? Number(trade.avg_fill_price ?? 0);
      if (!Number.isFinite(price) || price <= 0) {
        price = 1;
      }
      instrumentPrices.set(trade.instrument, price);
    }
    const notional = size * price;
    exposureByInstrument[trade.instrument] = (exposureByInstrument[trade.instrument] ?? 0) + notional;
    totalExposure += notional;
  }

  const start = startOfUtcDay();
  const todaysTrades = await listTrades({ start, page: 1, pageSize: 10000 });
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

export function evaluateMarginFeasibility(input: {
  projectedNotional: number;
  totalExposure: number;
  leverage?: number | null;
  policyMaxTotalExposure: number;
  policyMaxLeverage: number;
  minLiquidationBufferBps: number;
}): MarginFeasibilityResult {
  const effectiveLeverage =
    typeof input.leverage === "number" && Number.isFinite(input.leverage) && input.leverage > 0 ? input.leverage : 1;
  const policyLeverage =
    Number.isFinite(input.policyMaxLeverage) && input.policyMaxLeverage > 0 ? input.policyMaxLeverage : 1;
  const projectedNotional = Math.max(0, Number(input.projectedNotional) || 0);
  const totalExposure = Math.max(0, Number(input.totalExposure) || 0);
  const maxTotalExposure = Math.max(0, Number(input.policyMaxTotalExposure) || 0);

  const maxMarginBudget = maxTotalExposure / policyLeverage;
  const projectedMarginUsage = (totalExposure + projectedNotional) / effectiveLeverage;
  const usedMarginBudget = totalExposure / policyLeverage;
  const remainingMarginBudget = Math.max(0, maxMarginBudget - usedMarginBudget);
  const liquidationBufferBps = 10_000 / effectiveLeverage;

  const reasons: string[] = [];
  if (projectedMarginUsage > maxMarginBudget + 1e-9) {
    reasons.push("insufficient_margin_headroom");
  }
  if (liquidationBufferBps < Math.max(0, input.minLiquidationBufferBps)) {
    reasons.push("liquidation_buffer_too_low");
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    metrics: {
      effectiveLeverage,
      liquidationBufferBps,
      projectedMarginUsage,
      maxMarginBudget,
      remainingMarginBudget,
    },
  };
}

export async function evaluateAccountRisk(input: AccountRiskInput): Promise<AccountRiskEvaluation> {
  const env = loadEnv();
  const policy = await ensurePolicy();
  let state = await ensureState();
  state = await clearCooldownIfExpired(state);

  const snapshot = await computeSnapshot(input);
  const exposureByInstrument = snapshot.exposureByInstrument[input.instrument] ?? 0;
  const referencePrice = await resolveReferencePrice(input.instrument, input.referencePrice ?? null);
  if (input.quantity > 0 && (!referencePrice || !Number.isFinite(referencePrice) || referencePrice <= 0)) {
    return {
      allowed: false,
      reasons: ["missing_price_reference"],
      snapshot,
      policy,
      state,
    };
  }
  const projectedNotional = Math.abs(input.quantity) * (referencePrice ?? 1);

  const reasons: string[] = [];
  if (snapshot.totalExposure + projectedNotional > policy.max_total_exposure) {
    reasons.push("max_total_exposure");
  }
  if (exposureByInstrument + projectedNotional > policy.max_instrument_exposure) {
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
  const marginFeasibility = evaluateMarginFeasibility({
    projectedNotional,
    totalExposure: snapshot.totalExposure,
    leverage: input.leverage ?? null,
    policyMaxTotalExposure: policy.max_total_exposure,
    policyMaxLeverage: policy.max_leverage,
    minLiquidationBufferBps: env.ACCOUNT_RISK_MIN_LIQUIDATION_BUFFER_BPS,
  });
  reasons.push(...marginFeasibility.reasons);

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
