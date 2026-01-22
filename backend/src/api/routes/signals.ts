import { Hono } from "hono";
import { listSignals } from "../../db/repositories/signals";
import { parsePagination } from "../utils/pagination";

export const signalsRoutes = new Hono();

signalsRoutes.get("/", async (c) => {
  const source = c.req.query("source") ?? undefined;
  const minConfidence = c.req.query("min_confidence");
  const parsedConfidence = minConfidence ? Number.parseFloat(minConfidence) : undefined;
  const { page, pageSize } = parsePagination(c);
  const signals = await listSignals({
    sourceType: source,
    minConfidence: Number.isFinite(parsedConfidence ?? NaN) ? parsedConfidence : undefined,
    query: c.req.query("q") ?? undefined,
    start: c.req.query("start") ?? undefined,
    end: c.req.query("end") ?? undefined,
    page,
    pageSize,
  });
  return c.json(signals);
});
