import { Hono } from "hono";
import { listIdeas } from "../../db/repositories/ideas";
import { parsePagination } from "../utils/pagination";

export const ideasRoutes = new Hono();

ideasRoutes.get("/", async (c) => {
  const includeDuplicates = c.req.query("include_duplicates") === "true";
  const { page, pageSize } = parsePagination(c);
  const ideas = await listIdeas({
    includeDuplicates,
    sourceId: c.req.query("source") ?? undefined,
    sentiment: c.req.query("sentiment") ?? undefined,
    query: c.req.query("q") ?? undefined,
    start: c.req.query("start") ?? undefined,
    end: c.req.query("end") ?? undefined,
    page,
    pageSize,
  });
  return c.json(ideas);
});
