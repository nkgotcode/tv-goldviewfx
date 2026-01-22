import type { IngestionRun } from "../services/ops";

function formatDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function IngestionRunsTable({ runs, loading }: { runs: IngestionRun[]; loading: boolean }) {
  if (loading) {
    return <div className="empty">Loading ingestion runs…</div>;
  }
  if (runs.length === 0) {
    return <div className="empty">No ingestion runs recorded yet.</div>;
  }

  return (
    <div className="table-card">
      <h3>Ingestion Runs</h3>
      <p>Recent operator activity and ingestion outcomes.</p>
      <table className="table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Feed</th>
            <th>Status</th>
            <th>Started</th>
            <th>Finished</th>
            <th>New</th>
            <th>Errors</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>{run.source_type}</td>
              <td>{run.feed ?? "default"}</td>
              <td>{run.status}</td>
              <td>{formatDate(run.started_at)}</td>
              <td>{formatDate(run.finished_at ?? null)}</td>
              <td>{run.new_count}</td>
              <td>{run.error_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
