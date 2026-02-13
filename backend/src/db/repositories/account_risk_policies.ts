import { convex } from "../client";
import { assertNoError } from "./base";

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
  const result = await convex.from("account_risk_policies").insert(payload).select("*").single();
  return assertNoError(result, "insert account risk policy");
}

export async function updateAccountRiskPolicy(id: string, payload: Partial<AccountRiskPolicyInsert>) {
  const result = await convex
    .from("account_risk_policies")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  return assertNoError(result, "update account risk policy");
}

export async function listAccountRiskPolicies(filters: { activeOnly?: boolean } = {}) {
  const query = convex.from("account_risk_policies").select("*").order("effective_from", { ascending: false });
  if (filters.activeOnly) {
    query.eq("active", true);
  }
  const result = await query;
  return assertNoError(result, "list account risk policies");
}

export async function getAccountRiskPolicy(id: string) {
  const result = await convex.from("account_risk_policies").select("*").eq("id", id).single();
  return assertNoError(result, "get account risk policy");
}

export async function getActiveAccountRiskPolicy() {
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
