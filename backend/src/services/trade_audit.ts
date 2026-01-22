import { logInfo } from "./logger";

export function auditTrade(event: string, payload: Record<string, unknown>) {
  logInfo(`trade.${event}`, payload);
}
