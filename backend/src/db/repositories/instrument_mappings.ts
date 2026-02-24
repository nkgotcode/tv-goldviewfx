import type { ContractType } from "../../config/instrument_normalization";
import { listRlOpsRows, rlOpsUsesTimescale, upsertRlOpsRow } from "../timescale/rl_ops";

export type InstrumentMappingRow = {
  canonical_instrument_id: string;
  venue: string;
  venue_symbol: string;
  contract_type: string;
  tick_size: number;
  step_size: number;
  contract_multiplier: number;
  margin_currency: string;
  maker_fee_bps: number;
  taker_fee_bps: number;
  vip_tier_metadata: Record<string, unknown> | null;
  updated_at: string;
};

export async function upsertInstrumentMapping(payload: {
  canonical_instrument_id: string;
  venue: string;
  venue_symbol: string;
  contract_type?: ContractType;
  tick_size: number;
  step_size: number;
  contract_multiplier?: number;
  margin_currency?: string;
  maker_fee_bps?: number;
  taker_fee_bps?: number;
  vip_tier_metadata?: Record<string, unknown> | null;
}): Promise<InstrumentMappingRow | null> {
  if (!rlOpsUsesTimescale()) return null;
  const now = new Date().toISOString();
  const row = await upsertRlOpsRow<InstrumentMappingRow>(
    "instrument_mappings",
    {
      canonical_instrument_id: payload.canonical_instrument_id,
      venue: payload.venue,
      venue_symbol: payload.venue_symbol,
      contract_type: payload.contract_type ?? "PERP",
      tick_size: payload.tick_size,
      step_size: payload.step_size,
      contract_multiplier: payload.contract_multiplier ?? 1,
      margin_currency: payload.margin_currency ?? "USDT",
      maker_fee_bps: payload.maker_fee_bps ?? 0,
      taker_fee_bps: payload.taker_fee_bps ?? 0,
      vip_tier_metadata: payload.vip_tier_metadata ?? null,
      updated_at: now,
    },
    ["canonical_instrument_id"]
  );
  return row ?? null;
}

export async function getInstrumentMappingByCanonicalId(
  canonicalInstrumentId: string
): Promise<InstrumentMappingRow | null> {
  if (!rlOpsUsesTimescale()) return null;
  const rows = await listRlOpsRows<InstrumentMappingRow>("instrument_mappings", {
    filters: [{ field: "canonical_instrument_id", value: canonicalInstrumentId }],
    limit: 1,
  });
  return rows[0] ?? null;
}

export async function getInstrumentMappingByVenueSymbol(
  venue: string,
  venueSymbol: string
): Promise<InstrumentMappingRow | null> {
  if (!rlOpsUsesTimescale()) return null;
  const rows = await listRlOpsRows<InstrumentMappingRow>("instrument_mappings", {
    filters: [
      { field: "venue", value: venue },
      { field: "venue_symbol", value: venueSymbol },
    ],
    limit: 1,
  });
  return rows[0] ?? null;
}

export async function listInstrumentMappings(venue?: string): Promise<InstrumentMappingRow[]> {
  if (!rlOpsUsesTimescale()) return [];
  const filters = venue ? [{ field: "venue", value: venue }] : undefined;
  return listRlOpsRows<InstrumentMappingRow>("instrument_mappings", {
    filters,
    orderBy: venue ? "venue_symbol" : "venue",
    direction: "asc",
  });
}
