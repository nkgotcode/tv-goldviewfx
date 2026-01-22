import { supabase } from "../client";
import { assertNoError } from "./base";

export type OpsAuditInsert = {
  actor: string;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  metadata?: Record<string, unknown>;
};

export async function insertOpsAuditEvent(payload: OpsAuditInsert) {
  const result = await supabase
    .from("ops_audit_events")
    .insert({
      actor: payload.actor,
      action: payload.action,
      resource_type: payload.resource_type,
      resource_id: payload.resource_id ?? null,
      metadata: payload.metadata ?? {},
    })
    .select("*")
    .single();

  return assertNoError(result, "insert ops audit event");
}

export async function listOpsAuditEvents(limit = 100) {
  const result = await supabase
    .from("ops_audit_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return assertNoError(result, "list ops audit events");
}
