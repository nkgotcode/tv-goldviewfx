import { randomUUID } from "node:crypto";
import { convex } from "../client";
import { assertNoError } from "./base";
import { insertRlOpsRow, listRlOpsRows, rlOpsUsesTimescale } from "../timescale/rl_ops";

export type OpsAuditInsert = {
  actor: string;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  metadata?: Record<string, unknown>;
};

export async function insertOpsAuditEvent(payload: OpsAuditInsert) {
  if (rlOpsUsesTimescale()) {
    const now = new Date().toISOString();
    return insertRlOpsRow("ops_audit_events", {
      id: randomUUID(),
      actor: payload.actor,
      action: payload.action,
      resource_type: payload.resource_type,
      resource_id: payload.resource_id ?? null,
      metadata: payload.metadata ?? {},
      created_at: now,
    });
  }
  const result = await convex
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
  if (rlOpsUsesTimescale()) {
    return listRlOpsRows("ops_audit_events", {
      orderBy: "created_at",
      direction: "desc",
      limit,
    });
  }
  const result = await convex
    .from("ops_audit_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return assertNoError(result, "list ops audit events");
}
