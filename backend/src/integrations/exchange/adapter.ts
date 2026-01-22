export type OrderSide = "long" | "short";

export interface OrderRequest {
  instrument: string;
  side: OrderSide;
  quantity: number;
  clientOrderId?: string;
  tpPrice?: number;
  slPrice?: number;
}

export interface OrderResult {
  orderId: string;
  status: "placed" | "rejected";
}

export interface ExchangeAdapter {
  placeOrder(request: OrderRequest): Promise<OrderResult>;
}
