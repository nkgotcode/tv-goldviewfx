import { convex } from "../client";
import { assertNoError } from "./base";

export type AccountRiskStateInsert = {
  status: "ok" | "cooldown";
  cooldown_until?: string | null;
  last_triggered_at?: string | null;
  trigger_reason?: string | null;
  updated_at?: string;
};

export async function insertAccountRiskState(payload: AccountRiskStateInsert) {
  const result = await convex.from("account_risk_state").insert(payload).select("*").single();
  return assertNoError(result, "insert account risk state");
}

export async function updateAccountRiskState(id: string, payload: Partial<AccountRiskStateInsert>) {
  const result = await convex
    .from("account_risk_state")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  return assertNoError(result, "update account risk state");
}

export async function getLatestAccountRiskState() {
  const result = await convex
    .from("account_risk_state")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    throw new Error(`get latest account risk state: ${result.error.message}`);
  }
  return result.data;
}
