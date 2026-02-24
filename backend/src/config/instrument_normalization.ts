/**
 * Canonical instrument ID scheme and venue/symbol mapping.
 * Format: VENUE:SYMBOL:CONTRACT (e.g. BINGX:BTC-USDT:PERP, BINANCE:BTCUSDT:PERP).
 */

export const CONTRACT_PERPETUAL = "PERP" as const;
export const CONTRACT_SPOT = "SPOT" as const;
export type ContractType = typeof CONTRACT_PERPETUAL | typeof CONTRACT_SPOT;

export type VenueId = "BINGX" | "BINANCE" | "BYBIT" | "OKX" | "HYPERLIQUID";

/** Canonical instrument id: VENUE:SYMBOL:CONTRACT */
export function toCanonicalInstrumentId(
  venue: VenueId,
  venueSymbol: string,
  contract: ContractType = CONTRACT_PERPETUAL
): string {
  const symbol = venueSymbol.trim().toUpperCase();
  return `${venue}:${symbol}:${contract}`;
}

/** Parse canonical id into venue, symbol, contract */
export function parseCanonicalInstrumentId(
  canonicalId: string
): { venue: VenueId; symbol: string; contract: ContractType } {
  const parts = canonicalId.trim().split(":");
  if (parts.length < 3) {
    throw new Error(`Invalid canonical instrument id: ${canonicalId}`);
  }
  const venue = parts[0]!.toUpperCase() as VenueId;
  const symbol = parts.slice(1, -1).join(":");
  const contract = (parts[parts.length - 1] ?? CONTRACT_PERPETUAL) as ContractType;
  return { venue, symbol, contract };
}

export type InstrumentMappingRecord = {
  canonical_instrument_id: string;
  venue: string;
  venue_symbol: string;
  contract_type: ContractType;
  tick_size: number;
  step_size: number;
  contract_multiplier: number;
  margin_currency: string;
  maker_fee_bps: number;
  taker_fee_bps: number;
  vip_tier_metadata?: Record<string, unknown> | null;
  updated_at: string;
};

/** Default venue symbol formats for known venues */
export function venueSymbolToCanonical(venue: VenueId, pair: string): string {
  const normalized = pair.trim().toUpperCase().replace(/\s/g, "");
  switch (venue) {
    case "BINGX":
      return normalized.includes("-") ? normalized : normalized.replace(/USDT$/, "-USDT");
    case "BINANCE":
      return normalized.replace(/-/g, "");
    case "BYBIT":
    case "OKX":
      return normalized.includes("-") ? normalized : `${normalized.slice(0, -4)}-${normalized.slice(-4)}`;
    case "HYPERLIQUID":
      return normalized.replace(/-USDT$/i, "");
    default:
      return normalized;
  }
}
