import type { Context } from "hono";

export type Pagination = {
  page: number;
  pageSize: number;
};

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

export function parsePagination(c: Context): Pagination {
  const pageRaw = c.req.query("page");
  const pageSizeRaw = c.req.query("page_size");
  const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(pageSizeRaw ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE),
  );
  return { page, pageSize };
}
