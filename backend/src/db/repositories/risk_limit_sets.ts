import { randomUUID } from "node:crypto";
import { convex } from "../client";
import { assertNoError } from "./base";
import { getRlOpsRowById, insertRlOpsRow, listRlOpsRows, rlOpsUsesTimescale, updateRlOpsRowById } from "../timescale/rl_ops";

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
  if (rlOpsUsesTimescale()) {
    const now = new Date().toISOString();
    return insertRlOpsRow("risk_limit_sets", {
      id: randomUUID(),
      active: true,
      effective_from: now,
      created_at: now,
      updated_at: now,
      ...payload,
      effective_from: payload.effective_from ?? now,
    });
  }
  const result = await convex.from("risk_limit_sets").insert(payload).select("*").single();
  return assertNoError(result, "insert risk limit set");
}

export async function updateRiskLimitSet(id: string, payload: Partial<RiskLimitSetInsert>) {
  if (rlOpsUsesTimescale()) {
    return updateRlOpsRowById("risk_limit_sets", id, payload);
  }
  const result = await convex.from("risk_limit_sets").update(payload).eq("id", id).select("*").single();
  return assertNoError(result, "update risk limit set");
}

export async function listRiskLimitSets(filters: { activeOnly?: boolean } = {}) {
  if (rlOpsUsesTimescale()) {
    const rlOpsFilters: Array<{ field: string; value: unknown }> = filters.activeOnly
      ? [{ field: "active", value: true }]
      : [];
    return listRlOpsRows("risk_limit_sets", {
      filters: rlOpsFilters,
      orderBy: "effective_from",
      direction: "desc",
    });
  }
  const query = convex.from("risk_limit_sets").select("*").order("effective_from", { ascending: false });
  if (filters.activeOnly) {
    query.eq("active", true);
  }
  const result = await query;
  return assertNoError(result, "list risk limit sets");
}

export async function getRiskLimitSet(id: string) {
  if (rlOpsUsesTimescale()) {
    const row = await getRlOpsRowById("risk_limit_sets", id);
    if (!row) {
      throw new Error("get risk limit set: missing data");
    }
    return row;
  }
  const result = await convex.from("risk_limit_sets").select("*").eq("id", id).single();
  return assertNoError(result, "get risk limit set");
}
