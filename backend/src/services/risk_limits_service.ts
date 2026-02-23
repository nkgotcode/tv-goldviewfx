import type { RiskLimitSetInput } from "../rl/schemas";
import { insertRiskLimitSet, updateRiskLimitSet, listRiskLimitSets, getRiskLimitSet } from "../db/repositories/risk_limit_sets";

export type RiskLimitSetRecord = {
  id: string;
  name: string;
  max_position_size: number;
  leverage_cap: number;
  max_daily_loss: number;
  max_drawdown: number;
  max_open_positions: number;
  effective_from: string;
  active: boolean;
};

export type RiskLimitEvaluationInput = {
  positionSize: number;
  referencePrice?: number;
  positionNotional?: number;
  portfolioExposure?: number;
  leverage?: number;
  dailyLoss?: number;
  drawdown?: number;
  openPositions?: number;
};

export type RiskLimitEvaluation = {
  allowed: boolean;
  reasons: string[];
};

export function evaluateRiskLimits(limit: RiskLimitSetRecord, input: RiskLimitEvaluationInput): RiskLimitEvaluation {
  const reasons: string[] = [];
  const referencePrice = Number.isFinite(input.referencePrice ?? NaN) && (input.referencePrice ?? 0) > 0
    ? Number(input.referencePrice)
    : 1;
  const positionNotional = Number.isFinite(input.positionNotional ?? NaN)
    ? Math.abs(Number(input.positionNotional))
    : Math.abs(input.positionSize) * referencePrice;
  const portfolioExposure = Number.isFinite(input.portfolioExposure ?? NaN)
    ? Math.abs(Number(input.portfolioExposure))
    : positionNotional;

  if (positionNotional > limit.max_position_size) {
    reasons.push("max_position_notional");
  }
  if (portfolioExposure > limit.max_position_size * Math.max(1, limit.max_open_positions)) {
    reasons.push("max_portfolio_exposure");
  }
  if (input.leverage !== undefined && input.leverage > limit.leverage_cap) {
    reasons.push("leverage_cap");
  }
  if (input.dailyLoss !== undefined && input.dailyLoss > limit.max_daily_loss) {
    reasons.push("max_daily_loss");
  }
  if (input.drawdown !== undefined && input.drawdown > limit.max_drawdown) {
    reasons.push("max_drawdown");
  }
  if (input.openPositions !== undefined && input.openPositions >= limit.max_open_positions) {
    reasons.push("max_open_positions");
  }

  return { allowed: reasons.length === 0, reasons };
}

function toDbPayload(payload: RiskLimitSetInput) {
  return {
    name: payload.name,
    max_position_size: payload.maxPositionSize,
    leverage_cap: payload.leverageCap,
    max_daily_loss: payload.maxDailyLoss,
    max_drawdown: payload.maxDrawdown,
    max_open_positions: payload.maxOpenPositions,
  };
}

export async function createRiskLimitSet(payload: RiskLimitSetInput) {
  return insertRiskLimitSet(toDbPayload(payload));
}

export async function updateRiskLimitSetRecord(id: string, payload: Partial<RiskLimitSetInput>) {
  const mapped: Partial<ReturnType<typeof toDbPayload>> = {};
  if (payload.name !== undefined) mapped.name = payload.name;
  if (payload.maxPositionSize !== undefined) mapped.max_position_size = payload.maxPositionSize;
  if (payload.leverageCap !== undefined) mapped.leverage_cap = payload.leverageCap;
  if (payload.maxDailyLoss !== undefined) mapped.max_daily_loss = payload.maxDailyLoss;
  if (payload.maxDrawdown !== undefined) mapped.max_drawdown = payload.maxDrawdown;
  if (payload.maxOpenPositions !== undefined) mapped.max_open_positions = payload.maxOpenPositions;
  return updateRiskLimitSet(id, mapped);
}

export async function listRiskLimits(activeOnly = false) {
  return listRiskLimitSets({ activeOnly });
}

export async function fetchRiskLimitSet(id: string) {
  return getRiskLimitSet(id);
}
