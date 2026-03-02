import { randomUUID } from "node:crypto";
import {
  getRlOpsRowById,
  insertRlOpsRow,
  listRlOpsRows,
  requireRlOpsTimescaleEnabled,
  updateRlOpsRowById,
} from "../timescale/rl_ops";

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
  requireRlOpsTimescaleEnabled("insertRiskLimitSet");
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

export async function updateRiskLimitSet(id: string, payload: Partial<RiskLimitSetInsert>) {
  requireRlOpsTimescaleEnabled("updateRiskLimitSet");
  return updateRlOpsRowById("risk_limit_sets", id, payload);
}

export async function listRiskLimitSets(filters: { activeOnly?: boolean } = {}) {
  requireRlOpsTimescaleEnabled("listRiskLimitSets");
  const rlOpsFilters: Array<{ field: string; value: unknown }> = filters.activeOnly
    ? [{ field: "active", value: true }]
    : [];
  return listRlOpsRows("risk_limit_sets", {
    filters: rlOpsFilters,
    orderBy: "effective_from",
    direction: "desc",
  });
}

export async function getRiskLimitSet(id: string) {
  requireRlOpsTimescaleEnabled("getRiskLimitSet");
  const row = await getRlOpsRowById("risk_limit_sets", id);
  if (!row) {
    throw new Error("get risk limit set: missing data");
  }
  return row;
}
