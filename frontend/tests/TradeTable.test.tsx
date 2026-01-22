import { render, screen } from "@testing-library/react";
import TradeTable from "../src/components/TradeTable";

const trades = [
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
    created_at: "2024-01-06T10:00:00Z",
  },
];

it("renders trades table", () => {
  render(
    <TradeTable
      trades={trades}
      loading={false}
      page={1}
      pageSize={10}
      total={1}
      onPageChange={() => {}}
      onPageSizeChange={() => {}}
    />,
  );
  expect(screen.getByText(/Trade Execution/i)).toBeInTheDocument();
  expect(screen.getByText(/GOLD/i)).toBeInTheDocument();
  expect(screen.getByText(/filled/i)).toBeInTheDocument();
});
