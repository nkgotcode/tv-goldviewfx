export type OrderSide = "long" | "short";

export interface OrderRequest {
  instrument: string;
  side: OrderSide;
  quantity: number;
  clientOrderId?: string;
  tpPrice?: number;
  slPrice?: number;
  reduceOnly?: boolean;
}

export interface OrderResult {
  orderId: string;
  status: "placed" | "rejected" | "cancelled";
}

export interface OrderDetail {
  orderId: string;
  executedQty?: number | null;
  avgPrice?: number | null;
  status?: string | null;
  profit?: number | null;
  tpPrice?: number | null;
  slPrice?: number | null;
}

export interface CancelOrderRequest {
  orderId?: string;
  clientOrderId?: string;
  instrument: string;
}

export interface ExchangeAdapter {
  placeOrder(request: OrderRequest): Promise<OrderResult>;
  cancelOrder(request: CancelOrderRequest): Promise<OrderResult>;
  getOrderDetail(orderId: string, instrument: string): Promise<OrderDetail>;
  getOrderDetailByClientOrderId?(clientOrderId: string, instrument: string): Promise<OrderDetail | null>;
}
