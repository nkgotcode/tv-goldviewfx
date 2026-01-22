"use client";

import type { BingxPairStatus } from "../../services/ingestion";

function formatTimestamp(value?: string | null) {
  if (!value) return "not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "not recorded";
  return date.toLocaleString();
}

export default function BingxFeedTable({ pairs }: { pairs: BingxPairStatus[] }) {
  return (
    <section className="table-card">
      <h3>BingX Market Feeds</h3>
      <p>Freshness and availability for each market feed by pair.</p>
      {pairs.length === 0 ? (
        <div className="empty">No BingX feed status data yet.</div>
      ) : (
        <table className="table compact">
          <thead>
            <tr>
              <th>Pair</th>
              <th>Feed</th>
              <th>Status</th>
              <th>Last Seen</th>
              <th>Threshold</th>
            </tr>
          </thead>
          <tbody>
            {pairs.flatMap((pair) =>
              pair.feeds.map((feed) => (
                <tr key={`${pair.pair}-${feed.source_type}`}>
                  <td>{pair.pair}</td>
                  <td>{feed.source_type.replace(/_/g, " ")}</td>
                  <td>
                    <span className="badge">{feed.status}</span>
                  </td>
                  <td>{formatTimestamp(feed.last_seen_at)}</td>
                  <td>{feed.freshness_threshold_seconds ?? "—"}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
