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
  };
});

vi.mock("../src/components/MarketKlinePanel", () => {
  return {
    default: () => <div>Chart</div>,
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

it("renders command deck overview", () => {
  render(<HomePage />);
  expect(screen.getByText(/Signal Command Atlas/i)).toBeInTheDocument();
  expect(screen.getByText(/System Atlas/i)).toBeInTheDocument();
  expect(screen.getByText(/Command Deck/i)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Navigate the live control rooms/i })).toBeInTheDocument();
});
