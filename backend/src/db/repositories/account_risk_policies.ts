import { randomUUID } from "node:crypto";
import { convex } from "../client";
import { assertNoError } from "./base";
import { getRlOpsRowById, listRlOpsRows, rlOpsUsesTimescale, upsertRlOpsRow, updateRlOpsRowById } from "../timescale/rl_ops";

export type AccountRiskPolicyInsert = {
  name: string;
  max_total_exposure: number;
  max_instrument_exposure: number;
  max_open_positions: number;
  max_daily_loss: number;
  circuit_breaker_loss: number;
  cooldown_minutes: number;
  max_leverage?: number | null;
  active?: boolean;
  effective_from?: string;
};

export async function insertAccountRiskPolicy(payload: AccountRiskPolicyInsert) {
  if (rlOpsUsesTimescale()) {
    const now = new Date().toISOString();
    return upsertRlOpsRow("account_risk_policies", {
      id: randomUUID(),
      active: true,
      effective_from: now,
      created_at: now,
      updated_at: now,
      ...payload,
      effective_from: payload.effective_from ?? now,
    }, ["id"]);
  }
  const result = await convex.from("account_risk_policies").insert(payload).select("*").single();
  return assertNoError(result, "insert account risk policy");
}

export async function updateAccountRiskPolicy(id: string, payload: Partial<AccountRiskPolicyInsert>) {
  if (rlOpsUsesTimescale()) {
    return updateRlOpsRowById("account_risk_policies", id, {
      ...payload,
      updated_at: new Date().toISOString(),
    });
  }
  const result = await convex
    .from("account_risk_policies")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  return assertNoError(result, "update account risk policy");
}

export async function listAccountRiskPolicies(filters: { activeOnly?: boolean } = {}) {
  if (rlOpsUsesTimescale()) {
    const rlFilters = filters.activeOnly ? [{ field: "active", value: true }] : [];
    return listRlOpsRows("account_risk_policies", {
      filters: rlFilters,
      orderBy: "effective_from",
      direction: "desc",
    });
  }
  const query = convex.from("account_risk_policies").select("*").order("effective_from", { ascending: false });
  if (filters.activeOnly) {
    query.eq("active", true);
  }
  const result = await query;
  return assertNoError(result, "list account risk policies");
}

export async function getAccountRiskPolicy(id: string) {
  if (rlOpsUsesTimescale()) {
    const row = await getRlOpsRowById("account_risk_policies", id);
    if (!row) {
      throw new Error("get account risk policy: missing data");
    }
    return row;
  }
  const result = await convex.from("account_risk_policies").select("*").eq("id", id).single();
  return assertNoError(result, "get account risk policy");
}

export async function getActiveAccountRiskPolicy() {
  if (rlOpsUsesTimescale()) {
    const rows = await listRlOpsRows("account_risk_policies", {
      filters: [{ field: "active", value: true }],
      orderBy: "effective_from",
      direction: "desc",
      limit: 1,
    });
    return rows[0] ?? null;
  }
  const result = await convex
    .from("account_risk_policies")
    .select("*")
    .eq("active", true)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    throw new Error(`get active account risk policy: ${result.error.message}`);
  }
  return result.data;
}
