import { NextRequest, NextResponse } from "next/server";

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

const BACKEND_REQUEST_TIMEOUT_MS = (() => {
  const raw = process.env.BACKEND_PROXY_TIMEOUT_MS ?? process.env.API_PROXY_TIMEOUT_MS ?? "45000";
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 45000;
  return parsed;
})();

type RouteParams = { path?: string[] };
type RouteContext = { params: RouteParams | Promise<RouteParams> };

function normalizeBaseUrl(raw?: string | null) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed, "http://localhost");
    return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function getBackendBaseUrl() {
  return process.env.API_BASE_URL?.trim() || process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
}

function deriveBackendBaseUrlFromRequest(request: NextRequest) {
  const hostHeader = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!hostHeader) return null;

  const firstHost = hostHeader.split(",")[0]?.trim() ?? "";
  const hostname = firstHost.replace(/:\d+$/, "");
  if (!hostname) return null;

  return `http://${hostname}:8787`;
}

function buildTargetUrlFromBase(request: NextRequest, path: string[], baseUrl: string) {
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/+$/, "");
  const suffix = path.join("/");
  base.pathname = `${basePath}/${suffix}`.replace(/\/+/g, "/");
  base.search = request.nextUrl.search;
  return base;
}

function buildBackendTargetUrls(request: NextRequest, path: string[]) {
  const configuredBaseUrl = normalizeBaseUrl(getBackendBaseUrl());
  if (configuredBaseUrl) {
    return [buildTargetUrlFromBase(request, path, configuredBaseUrl)];
  }

  const derivedBaseUrl = deriveBackendBaseUrlFromRequest(request);
  const candidates = [
    derivedBaseUrl,
    DEFAULT_BACKEND_BASE_URL,
  ].filter((value, index, all) => value && all.indexOf(value) === index) as string[];

  return candidates.map((candidate) => buildTargetUrlFromBase(request, path, candidate));
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

function createProxyErrorResponse(status: number, message: string, upstream?: string) {
  return NextResponse.json(
    {
      error: message,
      upstream,
    },
    { status },
  );
}

async function proxyRequest(request: NextRequest, context: RouteContext) {
  const params = await Promise.resolve(context.params);
  const path = params.path ?? [];
  const headers = buildForwardHeaders(request);
  const withBody = request.method !== "GET" && request.method !== "HEAD";
  const targetUrls = buildBackendTargetUrls(request, path);
  let lastError: unknown = null;

  for (const targetUrl of targetUrls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BACKEND_REQUEST_TIMEOUT_MS);

    try {
      const upstream = await fetch(targetUrl, {
        method: request.method,
        headers,
        body: withBody ? await request.arrayBuffer() : undefined,
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
      });

      const responseHeaders = new Headers(upstream.headers);
      HOP_BY_HOP_HEADERS.forEach((header) => responseHeaders.delete(header));
      responseHeaders.set("x-upstream-url", targetUrl.toString());

      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch (error) {
      lastError = error;
      clearTimeout(timeout);
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }

  const lastTarget = targetUrls[targetUrls.length - 1]?.toString();
  if (lastError instanceof Error && lastError.name === "AbortError") {
    return createProxyErrorResponse(504, `Upstream request timed out after ${BACKEND_REQUEST_TIMEOUT_MS}ms`, lastTarget);
  }

  if (lastError instanceof TypeError) {
    return createProxyErrorResponse(502, "Upstream network error while forwarding request", lastTarget);
  }

  const message = lastError instanceof Error ? lastError.message : "Unexpected proxy failure";
  return createProxyErrorResponse(502, message, lastTarget);
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
