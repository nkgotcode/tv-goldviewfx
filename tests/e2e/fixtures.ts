import { request } from "@playwright/test";

export async function apiRequest(baseURL?: string) {
  const context = await request.newContext({
    baseURL: baseURL ?? process.env.E2E_API_BASE_URL ?? "http://localhost:8787",
    extraHTTPHeaders: buildAuthHeaders(),
  });
  return context;
}

function buildAuthHeaders(): Record<string, string> {
  const token = process.env.API_TOKEN;
  if (!token) {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}
