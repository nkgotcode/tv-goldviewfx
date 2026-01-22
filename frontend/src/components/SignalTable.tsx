import type { Signal } from "../services/api";
import PaginationControls from "./PaginationControls";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatConfidence(value: number) {
  return value.toFixed(2);
}

type SignalTableProps = {
  signals: Signal[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export default function SignalTable({
  signals,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: SignalTableProps) {
  return (
    <section className="table-card">
      <h3>Signal Flow</h3>
      <p>Normalized signals feeding the agent, enriched with confidence and source tags.</p>
      {loading ? (
        <div className="empty">Loading signals…</div>
      ) : signals.length === 0 ? (
        <div className="empty">No signals match the current filters.</div>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Summary</th>
                <th>Source</th>
                <th>Confidence</th>
                <th>Generated</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((signal) => (
                <tr key={signal.id}>
                  <td>{signal.payload_summary ?? "—"}</td>
                  <td>{signal.source_type}</td>
                  <td>{formatConfidence(signal.confidence_score)}</td>
                  <td>{formatDate(signal.generated_at)}</td>
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
