"use client";

import type { IngestionSource } from "../../services/ingestion";

function formatTimestamp(value?: string | null) {
  if (!value) return "not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "not recorded";
  return date.toLocaleString();
}

export default function IngestionSourcesTable({
  title,
  description,
  sources,
}: {
  title: string;
  description: string;
  sources: IngestionSource[];
}) {
  return (
    <section className="table-card">
      <h3>{title}</h3>
      <p>{description}</p>
      {sources.length === 0 ? (
        <div className="empty">No sources configured yet.</div>
      ) : (
        <table className="table compact">
          <thead>
            <tr>
              <th>Identifier</th>
              <th>Status</th>
              <th>Last Run</th>
              <th>Last Result</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id}>
                <td>
                  <div>{source.display_name ?? source.identifier}</div>
                  <div className="inline-muted">{source.identifier}</div>
                </td>
                <td>
                  <span className="badge">{source.state}</span>
                </td>
                <td>{formatTimestamp(source.last_run_at)}</td>
                <td>{source.last_run?.status ?? "unavailable"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
