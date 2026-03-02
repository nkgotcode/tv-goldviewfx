import { Hono } from "hono";
import { listOpsAuditEvents } from "../../db/repositories/ops_audit_events";
import { logWarn } from "../../services/logger";

export const opsAuditRoutes = new Hono();

const OPS_READ_TIMEOUT_MS = (() => {
  const parsed = Number.parseInt(process.env.OPS_READ_TIMEOUT_MS ?? "4000", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 4000;
  return parsed;
})();

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_timeout_${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

opsAuditRoutes.get("/", async (c) => {
  const limit = Number.parseInt(c.req.query("limit") ?? "100", 10);
  const safeLimit = Number.isNaN(limit) ? 100 : Math.max(1, Math.min(limit, 500));
  try {
    const events = await withTimeout(
      listOpsAuditEvents(safeLimit),
      OPS_READ_TIMEOUT_MS,
      "ops_audit_list",
    );
    return c.json({ data: events });
  } catch (error) {
    logWarn("Failed to load ops audit events", { error: String(error) });
    return c.json({ data: [] });
  }
});
