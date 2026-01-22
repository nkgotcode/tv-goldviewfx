import type { DataSourceRun } from "../../services/data_sources";

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function DataSourceRunsTable({ runs }: { runs: DataSourceRun[] }) {
  return (
    <section className="table-card">
      <h3>Ingestion Run History</h3>
      <p>Recent data source ingests across BingX, TradingView, and Telegram.</p>
      {runs.length === 0 ? (
        <div className="empty">No runs recorded yet.</div>
      ) : (
        <table className="table compact">
          <thead>
            <tr>
              <th>Started</th>
              <th>Source</th>
              <th>Pair</th>
              <th>Status</th>
              <th>New</th>
              <th>Updated</th>
              <th>Errors</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>{formatTimestamp(run.startedAt)}</td>
                <td className="mono">{run.sourceType}</td>
                <td>{run.pair}</td>
                <td>
                  <span className="badge">{run.status}</span>
                </td>
                <td>{run.newCount}</td>
                <td>{run.updatedCount}</td>
                <td>{run.errorCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
