import { render, screen } from "@testing-library/react";
import TelegramTable from "../src/components/TelegramTable";

const posts = [
  {
    id: "post-1",
    external_id: "1001",
    content: "Gold update for the week",
    published_at: "2024-01-07T10:00:00Z",
    dedup_status: "canonical",
    status: "active",
  },
];

it("renders telegram posts", () => {
  render(
    <TelegramTable
      posts={posts}
      loading={false}
      page={1}
      pageSize={10}
      total={1}
      onPageChange={() => {}}
      onPageSizeChange={() => {}}
    />,
  );
  expect(screen.getByText(/Telegram Intelligence/i)).toBeInTheDocument();
  expect(screen.getByText(/Gold update/i)).toBeInTheDocument();
  expect(screen.getByText(/canonical/i)).toBeInTheDocument();
});
