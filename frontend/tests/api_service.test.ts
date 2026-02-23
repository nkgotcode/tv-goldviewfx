import { beforeEach, expect, test, vi } from "vitest";
import {
  fetchDashboardSummary,
  fetchIdeas,
  fetchSignals,
  fetchTelegramPosts,
  fetchTrades,
  fetchTradeDetail,
} from "../src/services/api";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

test("api service methods call backend endpoints with no-store semantics", async () => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true }),
  });

  await fetchDashboardSummary();
  await fetchIdeas();
  await fetchSignals();
  await fetchTelegramPosts();
  await fetchTrades();
  await fetchTradeDetail("trade-1");

  expect(mockFetch).toHaveBeenCalledTimes(6);
  expect(mockFetch).toHaveBeenNthCalledWith(
    1,
    "/api/backend/dashboard/summary",
    expect.objectContaining({ cache: "no-store", headers: {} }),
  );
  expect(mockFetch).toHaveBeenNthCalledWith(2, "/api/backend/ideas", expect.any(Object));
  expect(mockFetch).toHaveBeenNthCalledWith(3, "/api/backend/signals", expect.any(Object));
  expect(mockFetch).toHaveBeenNthCalledWith(4, "/api/backend/telegram/posts", expect.any(Object));
  expect(mockFetch).toHaveBeenNthCalledWith(5, "/api/backend/trades", expect.any(Object));
  expect(mockFetch).toHaveBeenNthCalledWith(6, "/api/backend/trades/trade-1", expect.any(Object));
});

test("api service throws on non-ok responses", async () => {
  mockFetch.mockResolvedValue({
    ok: false,
    status: 503,
    json: async () => ({}),
  });

  await expect(fetchDashboardSummary()).rejects.toThrow("API error: 503");
});
