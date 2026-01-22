import { render, screen } from "@testing-library/react";
import IdeaTable from "../src/components/IdeaTable";

const ideas = [
  {
    id: "idea-1",
    title: "Gold breakout above 2000",
    url: "https://example.com/idea",
    published_at: "2024-01-01T10:00:00Z",
    dedup_status: "canonical",
    enrichments: [{ sentiment_label: "positive", sentiment_score: 0.72 }],
  },
];

it("renders ideas in the table", () => {
  render(
    <IdeaTable
      ideas={ideas}
      loading={false}
      page={1}
      pageSize={10}
      total={1}
      onPageChange={() => {}}
      onPageSizeChange={() => {}}
    />,
  );
  expect(screen.getByText(/TradingView Ideas/i)).toBeInTheDocument();
  expect(screen.getByText(/Gold breakout/i)).toBeInTheDocument();
  expect(screen.getByText(/positive/i)).toBeInTheDocument();
});

it("shows empty state when no ideas", () => {
  render(
    <IdeaTable
      ideas={[]}
      loading={false}
      page={1}
      pageSize={10}
      total={0}
      onPageChange={() => {}}
      onPageSizeChange={() => {}}
    />,
  );
  expect(screen.getByText(/No ideas match/i)).toBeInTheDocument();
});
