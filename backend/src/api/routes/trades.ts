import { Hono } from "hono";
import { getTradeById, listTrades } from "../../db/repositories/trades";
import { listTradeExecutions } from "../../db/repositories/trade_executions";
import { parsePagination } from "../utils/pagination";

export const tradesRoutes = new Hono();

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
