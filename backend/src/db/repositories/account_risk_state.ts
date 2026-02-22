import { randomUUID } from "node:crypto";
import { convex } from "../client";
import { assertNoError } from "./base";
import { insertRlOpsRow, listRlOpsRows, rlOpsUsesTimescale, updateRlOpsRowById } from "../timescale/rl_ops";

export type AccountRiskStateInsert = {
  status: "ok" | "cooldown";
  cooldown_until?: string | null;
  last_triggered_at?: string | null;
  trigger_reason?: string | null;
  updated_at?: string;
};

export async function insertAccountRiskState(payload: AccountRiskStateInsert) {
  if (rlOpsUsesTimescale()) {
    const now = new Date().toISOString();
    return insertRlOpsRow("account_risk_state", {
      id: randomUUID(),
      updated_at: now,
      created_at: now,
      ...payload,
      updated_at: payload.updated_at ?? now,
    });
  }
  const result = await convex.from("account_risk_state").insert(payload).select("*").single();
  return assertNoError(result, "insert account risk state");
}

export async function updateAccountRiskState(id: string, payload: Partial<AccountRiskStateInsert>) {
  if (rlOpsUsesTimescale()) {
    return updateRlOpsRowById("account_risk_state", id, {
      ...payload,
      updated_at: new Date().toISOString(),
    });
  }
  const result = await convex
    .from("account_risk_state")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  return assertNoError(result, "update account risk state");
}

export async function getLatestAccountRiskState() {
  if (rlOpsUsesTimescale()) {
    const rows = await listRlOpsRows("account_risk_state", {
      orderBy: "updated_at",
      direction: "desc",
      limit: 1,
    });
    return rows[0] ?? null;
  }
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
