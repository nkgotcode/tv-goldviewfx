import type { CancelOrderRequest, ExchangeAdapter, OrderDetail, OrderRequest, OrderResult } from "./adapter";

export class PaperExchangeAdapter implements ExchangeAdapter {
  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    return {
      orderId: `paper-${Date.now()}`,
      status: "placed",
    };
  }

  async cancelOrder(request: CancelOrderRequest): Promise<OrderResult> {
    const orderId = request.orderId ?? request.clientOrderId ?? `paper-${Date.now()}`;
    return {
      orderId,
      status: "cancelled",
    };
  }

  async getOrderDetail(orderId: string, _instrument: string): Promise<OrderDetail> {
    return { orderId, status: "FILLED", executedQty: 0, avgPrice: 0 };
  }

  async getOrderDetailByClientOrderId(_clientOrderId: string, _instrument: string): Promise<OrderDetail | null> {
    return null;
  }
}
