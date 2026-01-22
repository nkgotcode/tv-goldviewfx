import type { DatasetVersion, FeatureSetVersion } from "../../services/datasets";

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function DatasetPanel({
  datasets,
  featureSets,
}: {
  datasets: DatasetVersion[];
  featureSets: FeatureSetVersion[];
}) {
  const latestDatasets = datasets.slice(0, 5);

  return (
    <section className="table-card">
      <h3>Dataset Versions</h3>
      <p>Track dataset lineage, checksums, and feature set versions tied to evaluations.</p>
      {latestDatasets.length === 0 ? (
        <div className="empty">No dataset versions recorded yet.</div>
      ) : (
        <table className="table compact">
          <thead>
            <tr>
              <th>Created</th>
              <th>Pair</th>
              <th>Interval</th>
              <th>Window</th>
              <th>Checksum</th>
            </tr>
          </thead>
          <tbody>
            {latestDatasets.map((dataset) => (
              <tr key={dataset.id}>
                <td>{formatTimestamp(dataset.created_at)}</td>
                <td>{dataset.pair}</td>
                <td>{dataset.interval}</td>
                <td>
                  {formatTimestamp(dataset.start_at)} → {formatTimestamp(dataset.end_at)}
                </td>
                <td className="mono">{dataset.checksum.slice(0, 10)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="detail-grid">
        <div>
          <span>Feature Sets</span>
          <strong>{featureSets.length}</strong>
        </div>
        <div>
          <span>Latest Feature Set</span>
          <strong>{featureSets[0]?.label ?? "—"}</strong>
        </div>
      </div>
    </section>
  );
}
