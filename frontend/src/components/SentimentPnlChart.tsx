"use client";

import { useEffect, useState } from "react";
import { fetchSentimentPnl, type SentimentPnl } from "../services/ops";

export default function SentimentPnlChart() {
  const [data, setData] = useState<SentimentPnl | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const payload = await fetchSentimentPnl();
        if (mounted) setData(payload);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <div className="empty">Loading sentiment analytics…</div>;
  }
  if (!data) {
    return <div className="empty">No sentiment analytics available.</div>;
  }

  return (
    <section className="table-card">
      <h3>Sentiment vs PnL</h3>
      <p>Correlation between idea sentiment and realized performance.</p>
      <div className="inline-muted">Correlation: {data.correlation.toFixed(3)}</div>
      <table className="table">
        <thead>
          <tr>
            <th>Sentiment</th>
            <th>Avg PnL</th>
            <th>Trades</th>
          </tr>
        </thead>
        <tbody>
          {data.by_sentiment.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.avg_pnl.toFixed(2)}</td>
              <td>{row.trade_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
