"use client";

import { useList } from "@refinedev/core";
import type { Signal } from "../services/api";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function RecentSignalsPanel() {
  const { result, query } = useList<Signal>({
    resource: "signals",
    pagination: { currentPage: 1, pageSize: 6, mode: "server" },
  });

  const signals = result?.data ?? query?.data?.data ?? [];
  const loading = Boolean(query?.isLoading);
  const total = result?.total ?? query?.data?.total ?? signals.length;

  return (
    <section className="table-card">
      <h3>Signal Pulse</h3>
      <p>Latest signal decisions entering the execution queue.</p>
      <div className="inline-muted">{total} signals tracked</div>
      {loading ? (
        <div className="empty">Loading latest signals...</div>
      ) : signals.length === 0 ? (
        <div className="empty">No signals available.</div>
      ) : (
        <div className="table-scroll">
          <table className="table compact">
            <thead>
              <tr>
                <th>Time</th>
                <th>Source</th>
                <th>Confidence</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((signal) => (
                <tr key={signal.id}>
                  <td>{formatDate(signal.generated_at)}</td>
                  <td>{signal.source_type}</td>
                  <td>{signal.confidence_score.toFixed(2)}</td>
                  <td className="clamp-2">{signal.payload_summary ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
