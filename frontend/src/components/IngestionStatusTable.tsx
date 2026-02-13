import type { OpsIngestionStatusResponse } from "../services/ops";

function formatDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusClass(state: string) {
  if (state === "ok") return "status-pill status-ok";
  if (state === "failed") return "status-pill status-bad";
  if (state === "running") return "status-pill status-warn";
  if (state === "paused") return "status-pill status-muted";
  return "status-pill status-muted";
}

export default function IngestionStatusTable({
  status,
  loading,
}: {
  status: OpsIngestionStatusResponse | null;
  loading: boolean;
}) {
  return (
    <div className="table-card">
      <h3>Ingestion Status</h3>
      <p>Unified health view across TradingView, Telegram, and BingX feeds.</p>
      {loading ? (
        <div className="empty">Loading ingestion status…</div>
      ) : !status || status.sources.length === 0 ? (
        <div className="empty">No ingestion sources configured.</div>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Feed</th>
                <th>State</th>
                <th>Enabled</th>
                <th>Interval</th>
                <th>Backoff</th>
                <th>Last Run</th>
                <th>Next Run</th>
              </tr>
            </thead>
            <tbody>
              {status.sources.map((source) => (
                <tr key={`${source.source_type}-${source.source_id ?? "global"}-${source.feed ?? "default"}`}>
                  <td>{source.source_type}</td>
                  <td>{source.feed ?? "default"}</td>
                  <td>
                    <span className={statusClass(source.state)}>{source.state}</span>
                  </td>
                  <td>{source.enabled ? "yes" : "no"}</td>
                  <td>{source.refresh_interval_seconds ?? "—"}</td>
                  <td>
                    {source.backoff_base_seconds ?? "—"} / {source.backoff_max_seconds ?? "—"}
                  </td>
                  <td>{formatDate(source.last_run_at)}</td>
                  <td>{formatDate(source.next_run_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
