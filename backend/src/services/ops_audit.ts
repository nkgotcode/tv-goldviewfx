import { insertOpsAuditEvent } from "../db/repositories/ops_audit_events";
import { logWarn } from "./logger";

export type OpsAuditPayload = {
  actor: string;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordOpsAudit(payload: OpsAuditPayload) {
  try {
    return await insertOpsAuditEvent(payload);
  } catch (error) {
    logWarn("Failed to record ops audit", { error: String(error), action: payload.action });
    return null;
  }
}
