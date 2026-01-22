import type { DataSourceStatus } from "../../services/data_sources";

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function DataSourceStatusTable({
  pair,
  sources,
  onToggle,
}: {
  pair: string;
  sources: DataSourceStatus[];
  onToggle: (sourceType: string, enabled: boolean) => void;
}) {
  return (
    <section className="table-card">
      <h3>{pair} Feeds</h3>
      <p>Monitor freshness and enable or disable data sources for this pair.</p>
      {sources.length === 0 ? (
        <div className="empty">No data sources registered.</div>
      ) : (
        <table className="table compact">
          <thead>
            <tr>
              <th>Source</th>
              <th>Status</th>
              <th>Last Seen</th>
              <th>Threshold (s)</th>
              <th>Enabled</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={`${source.pair}-${source.source_type}`}>
                <td className="mono">{source.source_type}</td>
                <td>
                  <span className="badge">{source.status}</span>
                </td>
                <td>{formatTimestamp(source.last_seen_at)}</td>
                <td>{source.freshness_threshold_seconds}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={source.enabled}
                    onChange={(event) => onToggle(source.source_type, event.target.checked)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
