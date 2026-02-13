import { convex } from "../client";
import { assertNoError } from "./base";

export type RiskLimitSetInsert = {
  name: string;
  max_position_size: number;
  leverage_cap: number;
  max_daily_loss: number;
  max_drawdown: number;
  max_open_positions: number;
  effective_from?: string;
  active?: boolean;
};

export async function insertRiskLimitSet(payload: RiskLimitSetInsert) {
  const result = await convex.from("risk_limit_sets").insert(payload).select("*").single();
  return assertNoError(result, "insert risk limit set");
}

export async function updateRiskLimitSet(id: string, payload: Partial<RiskLimitSetInsert>) {
  const result = await convex.from("risk_limit_sets").update(payload).eq("id", id).select("*").single();
  return assertNoError(result, "update risk limit set");
}

export async function listRiskLimitSets(filters: { activeOnly?: boolean } = {}) {
  const query = convex.from("risk_limit_sets").select("*").order("effective_from", { ascending: false });
  if (filters.activeOnly) {
    query.eq("active", true);
  }
  const result = await query;
  return assertNoError(result, "list risk limit sets");
}

export async function getRiskLimitSet(id: string) {
  const result = await convex.from("risk_limit_sets").select("*").eq("id", id).single();
  return assertNoError(result, "get risk limit set");
}
