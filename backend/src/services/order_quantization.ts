import type { ExchangeInstrumentMetadata } from "./exchange_metadata_service";

export type QuantizeOrderInput = {
  quantity: number;
  tpPrice?: number | null;
  slPrice?: number | null;
  referencePrice?: number | null;
};

export type QuantizedOrder = {
  quantity: number;
  tpPrice: number | null;
  slPrice: number | null;
  adjusted: {
    quantity: boolean;
    tpPrice: boolean;
    slPrice: boolean;
  };
};

function decimalPlaces(step: number) {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const text = step.toString();
  if (text.includes("e-")) {
    const exponent = Number.parseInt(text.split("e-")[1] ?? "0", 10);
    return Number.isFinite(exponent) ? exponent : 0;
  }
  return (text.split(".")[1] ?? "").length;
}

function roundToStep(value: number, step: number, mode: "floor" | "nearest" = "floor") {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
  const factor = value / step;
  const rounded = mode === "nearest" ? Math.round(factor) * step : Math.floor(factor) * step;
  const precision = Math.min(12, decimalPlaces(step));
  return Number(rounded.toFixed(precision));
}

function sanitizePrice(value: number | null | undefined, step: number) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return roundToStep(value, step, "nearest");
}

export function quantizeOrderInput(input: QuantizeOrderInput, metadata: ExchangeInstrumentMetadata): QuantizedOrder {
  const quantityStep = metadata.quantityStep > 0 ? metadata.quantityStep : 10 ** -Math.max(0, metadata.quantityPrecision);
  const priceStep = metadata.priceStep > 0 ? metadata.priceStep : 10 ** -Math.max(0, metadata.pricePrecision);

  const requestedQty = Number(input.quantity);
  if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
    throw new Error("Order quantity must be a positive finite number");
  }

  const quantity = roundToStep(requestedQty, quantityStep, "floor");
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Order quantity rounds to zero after quantization");
  }
  if (quantity < metadata.minQuantity) {
    throw new Error(
      `Order quantity (${quantity}) below minimum quantity (${metadata.minQuantity}) for ${metadata.bingxSymbol}`,
    );
  }

  if (metadata.minNotional && metadata.minNotional > 0 && input.referencePrice && input.referencePrice > 0) {
    const notional = quantity * input.referencePrice;
    if (notional < metadata.minNotional) {
      throw new Error(
        `Order notional (${notional}) below minimum notional (${metadata.minNotional}) for ${metadata.bingxSymbol}`,
      );
    }
  }

  const tpPrice = sanitizePrice(input.tpPrice, priceStep);
  const slPrice = sanitizePrice(input.slPrice, priceStep);

  return {
    quantity,
    tpPrice,
    slPrice,
    adjusted: {
      quantity: Math.abs(quantity - requestedQty) > 1e-12,
      tpPrice: tpPrice !== null && input.tpPrice !== null && input.tpPrice !== undefined && Math.abs(tpPrice - input.tpPrice) > 1e-12,
      slPrice: slPrice !== null && input.slPrice !== null && input.slPrice !== undefined && Math.abs(slPrice - input.slPrice) > 1e-12,
    },
  };
}
