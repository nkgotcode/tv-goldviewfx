import type { Context, Next } from "hono";
import type { ZodSchema } from "zod";

export function validateJson<T>(schema: ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    const payload = await c.req.json().catch(() => null);
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error.issues }, 400);
    }
    c.set("validatedBody", parsed.data);
    return next();
  };
}
