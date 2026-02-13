import { createHmac } from "node:crypto";
import type {
  CancelOrderRequest,
  ExchangeAdapter,
  OrderDetail,
  OrderRequest,
  OrderResult,
} from "./adapter";

type BingxConfig = {
  apiKey: string;
  secretKey: string;
  baseUrl?: string;
  recvWindow?: number;
};

type BingxResponse<T> = {
  code: number;
  msg: string;
  data?: T;
};

type BingxOrderPayload = {
  order?: {
    orderId?: string | number;
    executedQty?: string;
    avgPrice?: string;
    status?: string;
    profit?: string;
    takeProfit?: { stopPrice?: number | string } | string | null;
    stopLoss?: { stopPrice?: number | string } | string | null;
  };
  orderId?: string | number;
};

type BingxStopConfig = NonNullable<BingxOrderPayload["order"]>["takeProfit"];

const DEFAULT_BASE_URL = "https://open-api.bingx.com";

function parseNumber(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractStopPrice(value: BingxStopConfig): number | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as { stopPrice?: number | string };
      return parseNumber(parsed.stopPrice);
    } catch {
      return null;
    }
  }
  if (typeof value === "object") {
    return parseNumber(value.stopPrice);
  }
  return null;
}

export class BingXExchangeAdapter implements ExchangeAdapter {
  constructor(private readonly config: BingxConfig) {}

  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    const params: Record<string, string | number> = {
      symbol: request.instrument,
      side: request.side === "long" ? "BUY" : "SELL",
      positionSide: request.side === "long" ? "LONG" : "SHORT",
      type: "MARKET",
      quantity: request.quantity,
    };

    if (request.clientOrderId) {
      params.clientOrderId = request.clientOrderId;
    }

    if (request.tpPrice) {
      params.takeProfit = JSON.stringify({
        type: "TAKE_PROFIT_MARKET",
        stopPrice: request.tpPrice,
        price: request.tpPrice,
        workingType: "MARK_PRICE",
      });
    }

    if (request.slPrice) {
      params.stopLoss = JSON.stringify({
        type: "STOP_MARKET",
        stopPrice: request.slPrice,
        price: request.slPrice,
        workingType: "MARK_PRICE",
      });
    }

    if (request.reduceOnly) {
      params.reduceOnly = true;
    }

    const payload = await this.request<BingxOrderPayload>("POST", "/openApi/swap/v2/trade/order", params);
    const orderId = payload?.order?.orderId ?? payload?.orderId ?? "unknown";
    return { orderId: String(orderId), status: "placed" };
  }

  async getOrderDetail(orderId: string, instrument: string): Promise<OrderDetail> {
    const detail = await this.getOrderDetailInternal({ orderId, instrument });
    if (!detail) {
      throw new Error("Order detail missing");
    }
    return detail;
  }

  async getOrderDetailByClientOrderId(clientOrderId: string, instrument: string): Promise<OrderDetail | null> {
    return this.getOrderDetailInternal({ clientOrderId, instrument, allowMissing: true });
  }

  async cancelOrder(request: CancelOrderRequest): Promise<OrderResult> {
    if (!request.orderId && !request.clientOrderId) {
      throw new Error("Missing order id for cancel");
    }
    const params: Record<string, string | number | boolean> = {
      symbol: request.instrument,
    };
    if (request.orderId) {
      params.orderId = request.orderId;
    }
    if (request.clientOrderId) {
      params.clientOrderId = request.clientOrderId;
    }
    const payload = await this.request<BingxOrderPayload>("DELETE", "/openApi/swap/v2/trade/order", params);
    const orderId = payload?.order?.orderId ?? payload?.orderId ?? request.orderId ?? request.clientOrderId ?? "unknown";
    return { orderId: String(orderId), status: "cancelled" };
  }

  private async getOrderDetailInternal(params: {
    orderId?: string;
    clientOrderId?: string;
    instrument: string;
    allowMissing?: boolean;
  }): Promise<OrderDetail | null> {
    const query: Record<string, string | number | boolean> = {
      symbol: params.instrument,
    };
    if (params.orderId) {
      query.orderId = params.orderId;
    }
    if (params.clientOrderId) {
      query.clientOrderId = params.clientOrderId;
    }
    const payload = await this.request<BingxOrderPayload>("GET", "/openApi/swap/v2/trade/order", query);
    if (!payload?.order && !payload?.orderId) {
      return params.allowMissing ? null : { orderId: params.orderId ?? params.clientOrderId ?? "unknown" };
    }
    const orderId = payload?.order?.orderId ?? payload?.orderId ?? params.orderId ?? params.clientOrderId ?? "unknown";
    return {
      orderId: String(orderId),
      executedQty: parseNumber(payload?.order?.executedQty),
      avgPrice: parseNumber(payload?.order?.avgPrice),
      status: payload?.order?.status ?? "UNKNOWN",
      profit: parseNumber(payload?.order?.profit),
      tpPrice: extractStopPrice(payload?.order?.takeProfit),
      slPrice: extractStopPrice(payload?.order?.stopLoss),
    };
  }

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    params: Record<string, string | number | boolean>,
  ): Promise<BingxResponse<T>["data"]> {
    const baseUrl = this.config.baseUrl ?? DEFAULT_BASE_URL;
    const timestamp = Date.now();
    const payload: Record<string, string | number | boolean> = {
      ...params,
      timestamp,
    };
    if (this.config.recvWindow) {
      payload.recvWindow = this.config.recvWindow;
    }

    const { query, signature } = this.buildSignature(payload);
    const queryString = query ? `${query}&signature=${signature}` : `signature=${signature}`;
    const url = `${baseUrl}${path}?${queryString}`;

    const response = await fetch(url, {
      method,
      headers: {
        "X-BX-APIKEY": this.config.apiKey,
      },
    });

    const body = (await response.json()) as BingxResponse<T>;
    if (!response.ok || body.code !== 0) {
      const message = body?.msg || `BingX API error (${response.status})`;
      throw new Error(message);
    }
    return body.data;
  }

  private buildSignature(params: Record<string, string | number | boolean>) {
    const entries = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .sort(([a], [b]) => a.localeCompare(b));

    const raw = entries.map(([key, value]) => `${key}=${value}`).join("&");
    const signature = createHmac("sha256", this.config.secretKey).update(raw).digest("hex");
    const query = entries.map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`).join("&");

    return { query, signature };
  }
}
