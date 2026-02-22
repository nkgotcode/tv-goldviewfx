import { NextRequest } from "next/server";

const DEFAULT_BACKEND_BASE_URL = "http://localhost:8787";
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

type RouteParams = { path?: string[] };
type RouteContext = { params: RouteParams | Promise<RouteParams> };

function getBackendBaseUrl() {
  return process.env.API_BASE_URL?.trim();
}

function deriveBackendBaseUrlFromRequest(request: NextRequest) {
  const hostHeader = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!hostHeader) return null;

  const firstHost = hostHeader.split(",")[0]?.trim() ?? "";
  const hostname = firstHost.replace(/:\d+$/, "");
  if (!hostname) return null;

  return `http://${hostname}:8787`;
}

function buildTargetUrl(request: NextRequest, path: string[]) {
  const base = new URL(getBackendBaseUrl() ?? deriveBackendBaseUrlFromRequest(request) ?? DEFAULT_BACKEND_BASE_URL);
  const basePath = base.pathname.replace(/\/+$/, "");
  const suffix = path.join("/");
  base.pathname = `${basePath}/${suffix}`.replace(/\/+/g, "/");
  base.search = request.nextUrl.search;
  return base;
}

function buildForwardHeaders(request: NextRequest) {
  const headers = new Headers(request.headers);
  HOP_BY_HOP_HEADERS.forEach((header) => headers.delete(header));

  if (!headers.has("authorization")) {
    const token = process.env.API_TOKEN ?? process.env.NEXT_PUBLIC_API_TOKEN;
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
  }

  return headers;
}

async function proxyRequest(request: NextRequest, context: RouteContext) {
  const params = await Promise.resolve(context.params);
  const path = params.path ?? [];
  const targetUrl = buildTargetUrl(request, path);
  const headers = buildForwardHeaders(request);
  const withBody = request.method !== "GET" && request.method !== "HEAD";

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: withBody ? await request.arrayBuffer() : undefined,
    cache: "no-store",
    redirect: "manual",
  });

  const responseHeaders = new Headers(upstream.headers);
  HOP_BY_HOP_HEADERS.forEach((header) => responseHeaders.delete(header));

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function OPTIONS(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}
