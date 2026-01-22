import { Hono } from "hono";
import { z } from "zod";
import { validateJson } from "../middleware/validate";
import { runTradingViewSync } from "../../services/tradingview_sync";

const syncRequestSchema = z.object({
  source_id: z.string().optional(),
  full_content: z.boolean().optional(),
  include_updates: z.boolean().optional(),
});

export const syncRoutes = new Hono();

syncRoutes.post("/tradingview", validateJson(syncRequestSchema), async (c) => {
  const payload = c.get("validatedBody") as z.infer<typeof syncRequestSchema>;
  const result = await runTradingViewSync({
    trigger: "manual",
    sourceId: payload.source_id,
    fetchFull: payload.full_content,
    includeUpdates: payload.include_updates,
  });
  return c.json(result, 202);
});
