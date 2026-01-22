"use client";

import { useEffect, useState } from "react";
import { fetchSourceEfficacy, type SourceEfficacy } from "../services/ops";

export default function SourceEfficacyPanel() {
  const [sources, setSources] = useState<SourceEfficacy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const payload = await fetchSourceEfficacy();
        if (mounted) setSources(payload.sources ?? []);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="table-card">
      <h3>Source Efficacy</h3>
      <p>Track idea → signal → trade conversion performance by source.</p>
      {loading ? (
        <div className="empty">Loading source efficacy…</div>
      ) : sources.length === 0 ? (
        <div className="empty">No efficacy metrics available.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Items</th>
              <th>Signals</th>
              <th>Trades</th>
              <th>Win Rate</th>
              <th>Signal Rate</th>
              <th>Trade Rate</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={`${source.source_type}-${source.source_id ?? "global"}`}>
                <td>{source.source_name}</td>
                <td>{source.item_count}</td>
                <td>{source.signal_count}</td>
                <td>{source.trade_count}</td>
                <td>{(source.win_rate * 100).toFixed(1)}%</td>
                <td>{(source.conversion_to_signal * 100).toFixed(1)}%</td>
                <td>{(source.conversion_to_trade * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
