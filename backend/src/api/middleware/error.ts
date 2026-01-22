import type { Context, Next } from "hono";
import { logError } from "../../services/logger";

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logError(message, { path: c.req.path, method: c.req.method });
    return c.json({ error: message }, 500);
  }
}
