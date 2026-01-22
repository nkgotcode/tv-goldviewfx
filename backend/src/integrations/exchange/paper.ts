import type { ExchangeAdapter, OrderRequest, OrderResult } from "./adapter";

export class PaperExchangeAdapter implements ExchangeAdapter {
  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    return {
      orderId: `paper-${Date.now()}`,
      status: "placed",
    };
  }
}
