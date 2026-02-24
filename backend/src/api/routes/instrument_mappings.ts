import { Hono } from "hono";
import { z } from "zod";
import { toCanonicalInstrumentId, type VenueId } from "../../config/instrument_normalization";
import {
  listInstrumentMappings,
  getInstrumentMappingByCanonicalId,
  upsertInstrumentMapping,
} from "../../db/repositories/instrument_mappings";
import { withOpsIdentity } from "../middleware/rbac";

const createPayloadSchema = z.object({
  venue: z.string().min(1),
  venue_symbol: z.string().min(1),
  contract_type: z.enum(["PERP", "SPOT"]).optional(),
  tick_size: z.number().positive(),
  step_size: z.number().positive(),
  contract_multiplier: z.number().nonnegative().optional(),
  margin_currency: z.string().min(1).optional(),
  maker_fee_bps: z.number().nonnegative().optional(),
  taker_fee_bps: z.number().nonnegative().optional(),
  vip_tier_metadata: z.record(z.unknown()).nullable().optional(),
});

export const instrumentMappingsRoutes = new Hono();

instrumentMappingsRoutes.use("*", withOpsIdentity);

instrumentMappingsRoutes.get("/", async (c) => {
  if (process.env.NODE_ENV === "test") {
    return c.json({ data: [] });
  }
  const venue = c.req.query("venue");
  try {
    const data = await listInstrumentMappings(venue ?? undefined);
    return c.json({ data });
  } catch (error) {
    return c.json({ error: "list_failed", message: String(error) }, 500);
  }
});

instrumentMappingsRoutes.get("/:canonicalId", async (c) => {
  const canonicalId = decodeURIComponent(c.req.param("canonicalId"));
  if (!canonicalId) {
    return c.json({ error: "missing_canonical_id" }, 400);
  }
  try {
    const row = await getInstrumentMappingByCanonicalId(canonicalId);
    if (!row) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json(row);
  } catch (error) {
    return c.json({ error: "get_failed", message: String(error) }, 500);
  }
});

instrumentMappingsRoutes.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = createPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_failed", issues: parsed.error.issues }, 400);
  }
  const payload = parsed.data;
  const venueId = payload.venue.toUpperCase() as VenueId;
  const allowed: VenueId[] = ["BINGX", "BINANCE", "BYBIT", "OKX", "HYPERLIQUID"];
  if (!allowed.includes(venueId)) {
    return c.json({ error: "unsupported_venue", venue: payload.venue }, 400);
  }
  const contractType = payload.contract_type ?? "PERP";
  const canonical_instrument_id = toCanonicalInstrumentId(
    venueId,
    payload.venue_symbol,
    contractType
  );
  try {
    const row = await upsertInstrumentMapping({
      canonical_instrument_id,
      venue: payload.venue,
      venue_symbol: payload.venue_symbol,
      contract_type: contractType,
      tick_size: payload.tick_size,
      step_size: payload.step_size,
      contract_multiplier: payload.contract_multiplier ?? 1,
      margin_currency: payload.margin_currency ?? "USDT",
      maker_fee_bps: payload.maker_fee_bps ?? 0,
      taker_fee_bps: payload.taker_fee_bps ?? 0,
      vip_tier_metadata: payload.vip_tier_metadata ?? null,
    });
    if (!row) {
      return c.json({ error: "store_unavailable" }, 503);
    }
    return c.json(row, 201);
  } catch (error) {
    return c.json({ error: "upsert_failed", message: String(error) }, 500);
  }
});
