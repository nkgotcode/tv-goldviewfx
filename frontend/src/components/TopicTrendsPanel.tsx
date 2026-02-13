"use client";

import { useEffect, useState } from "react";
import { fetchTopicTrends, type TopicTrend } from "../services/ops";

export default function TopicTrendsPanel() {
  const [trends, setTrends] = useState<TopicTrend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const payload = await fetchTopicTrends();
        if (mounted) setTrends(payload.trends ?? []);
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
      <h3>Topic Trends</h3>
      <p>Weekly and monthly topic clusters driving the idea stream.</p>
      {loading ? (
        <div className="empty">Loading topic trends…</div>
      ) : trends.length === 0 ? (
        <div className="empty">No topic clusters generated yet.</div>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Label</th>
                <th>Ideas</th>
                <th>Keywords</th>
              </tr>
            </thead>
            <tbody>
              {trends.map((trend) => (
                <tr key={trend.id}>
                  <td>{trend.period}</td>
                  <td>{trend.label}</td>
                  <td>{trend.idea_count}</td>
                  <td>{trend.keywords?.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
