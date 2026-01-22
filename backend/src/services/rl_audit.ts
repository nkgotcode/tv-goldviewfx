import { logInfo } from "./logger";

export function auditRlEvent(event: string, payload: Record<string, unknown>) {
  logInfo(`rl.${event}`, payload);
}
