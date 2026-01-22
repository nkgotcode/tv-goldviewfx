import { render, screen } from "@testing-library/react";
import SignalTable from "../src/components/SignalTable";

const signals = [
  {
    id: "signal-1",
    source_type: "telegram",
    idea_id: null,
    telegram_post_id: "post-1",
    payload_summary: "Gold momentum looks strong",
    confidence_score: 0.6,
    generated_at: "2024-01-05T10:00:00Z",
  },
];

it("renders signal rows", () => {
  render(
    <SignalTable
      signals={signals}
      loading={false}
      page={1}
      pageSize={10}
      total={1}
      onPageChange={() => {}}
      onPageSizeChange={() => {}}
    />,
  );
  expect(screen.getByText(/Signal Flow/i)).toBeInTheDocument();
  expect(screen.getByText(/Gold momentum/i)).toBeInTheDocument();
  expect(screen.getByText(/telegram/i)).toBeInTheDocument();
});
