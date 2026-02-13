import { Hono } from "hono";
import { z } from "zod";
import { getTradeById, listTrades } from "../../db/repositories/trades";
import { listTradeExecutions } from "../../db/repositories/trade_executions";
import { cancelTradeExecution, closeTradePosition } from "../../services/trade_execution";
import { recordOpsAudit } from "../../services/ops_audit";
import { requireOperatorRole, withOpsIdentity } from "../middleware/rbac";
import { validateJson } from "../middleware/validate";
import { parsePagination } from "../utils/pagination";

export const tradesRoutes = new Hono();

const cancelSchema = z
  .object({
    reason: z.string().optional(),
  })
  .nullable()
  .transform((value) => value ?? {});

const closeSchema = z
  .object({
    quantity: z.number().positive().optional(),
    clientOrderId: z.string().optional(),
    reason: z.string().optional(),
  })
  .nullable()
  .transform((value) => value ?? {});

tradesRoutes.get("/", async (c) => {
  const { page, pageSize } = parsePagination(c);
  const trades = await listTrades({
    status: c.req.query("status") ?? undefined,
    mode: c.req.query("mode") ?? undefined,
    instrument: c.req.query("instrument") ?? undefined,
    side: c.req.query("side") ?? undefined,
    start: c.req.query("start") ?? undefined,
    end: c.req.query("end") ?? undefined,
    page,
    pageSize,
  });
  return c.json(trades);
});

tradesRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const trade = await getTradeById(id);
  const executions = await listTradeExecutions(id);
  return c.json({ ...trade, executions });
});

tradesRoutes.post(
  "/:id/cancel",
  withOpsIdentity,
  requireOperatorRole,
  validateJson(cancelSchema),
  async (c) => {
    const id = c.req.param("id");
    const payload = c.get("validatedBody") as z.infer<typeof cancelSchema>;
    const result = await cancelTradeExecution(id, { reason: payload.reason ?? null });
    await recordOpsAudit({
      actor: c.get("opsActor") ?? "system",
      action: "trade.cancel",
      resource_type: "trade",
      resource_id: id,
      metadata: { reason: payload.reason ?? null, execution_id: result.execution.id },
    });
    return c.json(result);
  },
);

tradesRoutes.post(
  "/:id/close",
  withOpsIdentity,
  requireOperatorRole,
  validateJson(closeSchema),
  async (c) => {
    const id = c.req.param("id");
    const payload = c.get("validatedBody") as z.infer<typeof closeSchema>;
    const result = await closeTradePosition({
      tradeId: id,
      quantity: payload.quantity,
      clientOrderId: payload.clientOrderId,
      reason: payload.reason ?? null,
    });
    await recordOpsAudit({
      actor: c.get("opsActor") ?? "system",
      action: "trade.close",
      resource_type: "trade",
      resource_id: id,
      metadata: {
        reason: payload.reason ?? null,
        execution_id: result.execution.id,
        quantity: payload.quantity ?? null,
      },
    });
    return c.json(result);
  },
);
