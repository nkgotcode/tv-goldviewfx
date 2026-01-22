import type { TelegramPost } from "../services/api";
import PaginationControls from "./PaginationControls";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

type TelegramTableProps = {
  posts: TelegramPost[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export default function TelegramTable({
  posts,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: TelegramTableProps) {
  return (
    <section className="table-card">
      <h3>Telegram Intelligence</h3>
      <p>Premium channel posts feeding signal enrichment and trade context.</p>
      {loading ? (
        <div className="empty">Loading Telegram posts…</div>
      ) : posts.length === 0 ? (
        <div className="empty">No Telegram posts match the current filters.</div>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Content</th>
                <th>Status</th>
                <th>Dedup</th>
                <th>Published</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id}>
                  <td>{post.content || "—"}</td>
                  <td>{post.status}</td>
                  <td>{post.dedup_status}</td>
                  <td>{formatDate(post.published_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </>
      )}
    </section>
  );
}
