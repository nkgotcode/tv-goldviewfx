import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import OperationsPanel from "../src/components/OperationsPanel";

vi.mock("../src/services/ops", () => {
  return {
    fetchOpsIngestionStatus: () =>
      Promise.resolve({
        generated_at: "2025-01-01T00:00:00Z",
        sources: [],
      }),
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
  };
});

it("renders operations panel headings", async () => {
  render(<OperationsPanel />);
  expect(await screen.findByText(/Ingestion Status/i)).toBeInTheDocument();
  expect(screen.getByText(/Ingestion Controls/i)).toBeInTheDocument();
  expect(screen.getByText(/Trading Analytics/i)).toBeInTheDocument();
  expect(screen.getByText(/Ops Audit Log/i)).toBeInTheDocument();
});
