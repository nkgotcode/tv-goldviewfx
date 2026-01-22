import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import HomePage from "../src/app/page";

vi.mock("@refinedev/core", () => {
  return {
    useCustom: () => ({
      result: {
        data: {
          idea_count: 3,
          signal_count: 2,
          trade_count: 1,
          last_sync_status: "succeeded",
          last_sync_at: "2024-01-08T10:00:00Z",
        },
      },
      query: {
        data: {
          data: {
            idea_count: 3,
            signal_count: 2,
            trade_count: 1,
            last_sync_status: "succeeded",
            last_sync_at: "2024-01-08T10:00:00Z",
          },
        },
      },
    }),
    useList: ({ resource }: { resource: string }) => {
      const map: Record<string, any[]> = {
        ideas: [
          {
            id: "idea-1",
            title: "Idea",
            url: "https://example.com",
            published_at: "2024-01-01T00:00:00Z",
            dedup_status: "canonical",
            enrichments: [{ sentiment_label: "neutral", sentiment_score: 0.2 }],
          },
        ],
        signals: [
          {
            id: "signal-1",
            source_type: "tradingview",
            idea_id: "idea-1",
            telegram_post_id: null,
            payload_summary: "Signal summary",
            confidence_score: 0.4,
            generated_at: "2024-01-02T00:00:00Z",
          },
        ],
        trades: [
          {
            id: "trade-1",
            instrument: "GOLD-USDT",
            side: "long",
            quantity: 1,
            status: "filled",
            mode: "paper",
            avg_fill_price: null,
            position_size: null,
            pnl: null,
            pnl_pct: null,
            tp_price: null,
            sl_price: null,
            liquidation_price: null,
            leverage: null,
            margin_type: null,
            created_at: "2024-01-03T00:00:00Z",
          },
        ],
        "telegram-posts": [
          {
            id: "post-1",
            external_id: "1001",
            content: "Telegram update",
            published_at: "2024-01-04T00:00:00Z",
            dedup_status: "canonical",
            status: "active",
          },
        ],
      };
      return {
        result: { data: map[resource] ?? [], total: (map[resource] ?? []).length },
        query: { isLoading: false, data: { data: map[resource] ?? [], total: (map[resource] ?? []).length } },
      };
    },
  };
});

vi.mock("../src/services/ops", () => {
  return {
    fetchOpsIngestionStatus: () =>
      Promise.resolve({ generated_at: "2025-01-01T00:00:00Z", sources: [] }),
    fetchOpsIngestionRuns: () => Promise.resolve({ data: [], total: 0 }),
    fetchTradingSummary: () =>
      Promise.resolve({
        generated_at: "2025-01-01T00:00:00Z",
        trade_count: 0,
        filled_count: 0,
        win_rate: 0,
        net_pnl: 0,
        avg_pnl: 0,
        max_drawdown: 0,
        exposure_by_instrument: {},
      }),
    fetchTradingMetrics: () => Promise.resolve({ generated_at: "2025-01-01T00:00:00Z", series: [] }),
    fetchOpsAudit: () => Promise.resolve({ data: [] }),
    fetchSourceEfficacy: () => Promise.resolve({ generated_at: "2025-01-01T00:00:00Z", sources: [] }),
    fetchSentimentPnl: () =>
      Promise.resolve({ generated_at: "2025-01-01T00:00:00Z", correlation: 0, by_sentiment: [] }),
    fetchTopicTrends: () => Promise.resolve({ generated_at: "2025-01-01T00:00:00Z", trends: [] }),
    fetchAgentConfig: () =>
      Promise.resolve({
        id: "agent-1",
        enabled: true,
        mode: "paper",
        max_position_size: 1,
        daily_loss_limit: 0,
        allowed_instruments: ["GOLD-USDT"],
      }),
    updateAgentConfig: () =>
      Promise.resolve({
        id: "agent-1",
        enabled: true,
        mode: "paper",
        max_position_size: 1,
        daily_loss_limit: 0,
        allowed_instruments: ["GOLD-USDT"],
      }),
    fetchSourcePolicies: () => Promise.resolve({ data: [] }),
    updateSourcePolicy: () => Promise.resolve({}),
  };
});

it("renders command deck with filters", () => {
  render(<HomePage />);
  expect(screen.getByText(/Goldviewfx Signal Command/i)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /TradingView Ideas/i })).toBeInTheDocument();
  expect(screen.getAllByLabelText(/Keyword/i).length).toBeGreaterThan(1);
  expect(screen.getByRole("heading", { name: /Telegram Intelligence/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Clear all filters/i })).toBeInTheDocument();
});
