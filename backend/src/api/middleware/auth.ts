import type { Context, Next } from "hono";

export async function authMiddleware(c: Context, next: Next) {
  const path = new URL(c.req.url).pathname;
  if (path === "/health" || path.startsWith("/health/")) {
    return next();
  }
  if (path === "/metrics" || path === "/metrics/") {
    return next();
  }

  const token = process.env.API_TOKEN;
  if (!token) {
    return next();
  }
  const header = c.req.header("authorization") ?? "";
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || value !== token) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
}
