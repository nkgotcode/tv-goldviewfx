import { expect, test } from "bun:test";
import { getExchangeMetadata } from "../../src/services/exchange_metadata_service";
import { quantizeOrderInput } from "../../src/services/order_quantization";

test("fetches and normalizes exchange metadata contract", async () => {
  const fetcher: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        code: 0,
        data: [
          {
            symbol: "XAUT-USDT",
            tickSize: "0.1",
            stepSize: "0.001",
            minQty: "0.005",
            minNotional: "10",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  const metadata = await getExchangeMetadata("XAUTUSDT", {
    forceRefresh: true,
    fetcher,
  });

  expect(metadata.bingxSymbol).toBe("XAUT-USDT");
  expect(metadata.priceStep).toBeCloseTo(0.1);
  expect(metadata.quantityStep).toBeCloseTo(0.001);
  expect(metadata.minQuantity).toBeCloseTo(0.005);
  expect(metadata.minNotional).toBe(10);
  expect(metadata.pricePrecision).toBe(1);
  expect(metadata.quantityPrecision).toBe(3);
});

test("quantizes order values using metadata", () => {
  const quantized = quantizeOrderInput(
    {
      quantity: 0.0079,
      tpPrice: 2034.67,
      slPrice: 2022.64,
      referencePrice: 2030,
    },
    {
      pair: "XAUTUSDT",
      bingxSymbol: "XAUT-USDT",
      priceStep: 0.1,
      quantityStep: 0.001,
      minQuantity: 0.005,
      minNotional: 10,
      pricePrecision: 1,
      quantityPrecision: 3,
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      source: "bingx_api",
      fingerprint: "test",
    },
  );

  expect(quantized.quantity).toBe(0.007);
  expect(quantized.tpPrice).toBe(2034.7);
  expect(quantized.slPrice).toBe(2022.6);
});

test("rejects order quantities below venue minimum", () => {
  expect(() =>
    quantizeOrderInput(
      {
        quantity: 0.003,
      },
      {
        pair: "XAUTUSDT",
        bingxSymbol: "XAUT-USDT",
        priceStep: 0.1,
        quantityStep: 0.001,
        minQuantity: 0.005,
        minNotional: 10,
        pricePrecision: 1,
        quantityPrecision: 3,
        fetchedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        source: "bingx_api",
        fingerprint: "test",
      },
    ),
  ).toThrow("below minimum quantity");
});
