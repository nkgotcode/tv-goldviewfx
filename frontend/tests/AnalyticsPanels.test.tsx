import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import SourceEfficacyPanel from "../src/components/SourceEfficacyPanel";
import SentimentPnlChart from "../src/components/SentimentPnlChart";
import TopicTrendsPanel from "../src/components/TopicTrendsPanel";

vi.mock("../src/services/ops", () => {
  return {
    fetchSourceEfficacy: () =>
      Promise.resolve({
        generated_at: "2025-01-01T00:00:00Z",
        sources: [],
      }),
    fetchSentimentPnl: () =>
      Promise.resolve({
        generated_at: "2025-01-01T00:00:00Z",
        correlation: 0,
        by_sentiment: [],
      }),
    fetchTopicTrends: () =>
      Promise.resolve({
        generated_at: "2025-01-01T00:00:00Z",
        trends: [],
      }),
  };
});

it("renders analytics panels", async () => {
  render(
    <div>
      <SourceEfficacyPanel />
      <SentimentPnlChart />
      <TopicTrendsPanel />
    </div>,
  );
  expect(await screen.findByText(/Source Efficacy/i)).toBeInTheDocument();
  expect(screen.getByText(/Sentiment vs PnL/i)).toBeInTheDocument();
  expect(screen.getByText(/Topic Trends/i)).toBeInTheDocument();
});
